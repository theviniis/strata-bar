//! Unelevated process-tree loopback. The explicit stereo float format is
//! independent of the render endpoint (process loopback has no mix format).
use crate::spectrum_fft::Analyzer;
use std::{
    mem::{size_of, ManuallyDrop},
    sync::{mpsc, Arc},
};
use windows::{
    core::{implement, Interface, Ref, HRESULT},
    Win32::{
        Foundation::{CloseHandle, HANDLE},
        Media::Audio::*,
        System::{
            Com::{StructuredStorage::*, BLOB},
            Threading::{GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
            Variant::VT_BLOB,
        },
    },
};

#[implement(IActivateAudioInterfaceCompletionHandler)]
struct Completion {
    signal: mpsc::SyncSender<()>,
    // Keep the activation blob alive even if activation times out.
    _params: Arc<AUDIOCLIENT_ACTIVATION_PARAMS>,
}
impl IActivateAudioInterfaceCompletionHandler_Impl for Completion_Impl {
    fn ActivateCompleted(
        &self,
        _: Ref<IActivateAudioInterfaceAsyncOperation>,
    ) -> windows::core::Result<()> {
        let _ = self.signal.try_send(());
        Ok(())
    }
}
struct Process(HANDLE);
impl Drop for Process {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}
pub struct Capture {
    client: IAudioClient,
    reader: IAudioCaptureClient,
    process: Process,
    pub analyzer: Analyzer,
    pub packets: u64,
}
impl Capture {
    pub fn open(pid: u32) -> Result<Self, String> {
        unsafe { Self::activate(pid).map_err(|e| e.to_string()) }
    }
    unsafe fn activate(pid: u32) -> windows::core::Result<Self> {
        let process = Process(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)?);
        let params = Arc::new(AUDIOCLIENT_ACTIVATION_PARAMS {
            ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
            Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                    TargetProcessId: pid,
                    ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
                },
            },
        });
        // Borrowed blob; never pass it to PropVariantClear (it owns no allocation).
        let variant = ManuallyDrop::new(PROPVARIANT {
            Anonymous: PROPVARIANT_0 {
                Anonymous: ManuallyDrop::new(PROPVARIANT_0_0 {
                    vt: VT_BLOB,
                    Anonymous: PROPVARIANT_0_0_0 {
                        blob: BLOB {
                            cbSize: size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32,
                            pBlobData: Arc::as_ptr(&params).cast_mut().cast(),
                        },
                    },
                    ..Default::default()
                }),
            },
        });
        let (tx, rx) = mpsc::sync_channel(1);
        let handler: IActivateAudioInterfaceCompletionHandler = Completion {
            signal: tx,
            _params: params,
        }
        .into();
        let operation = ActivateAudioInterfaceAsync(
            VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
            &IAudioClient::IID,
            Some(&*variant),
            &handler,
        )?;
        rx.recv_timeout(std::time::Duration::from_secs(2))
            .map_err(|_| windows::core::Error::from_hresult(HRESULT(0x800705B4u32 as i32)))?;
        let mut result = HRESULT(0);
        let mut unknown = None;
        operation.GetActivateResult(&mut result, &mut unknown)?;
        result.ok()?;
        let client: IAudioClient = unknown
            .ok_or_else(windows::core::Error::from_thread)?
            .cast()?;
        // IEEE float stereo, 48 kHz. The process-loopback virtual endpoint
        // accepts an explicit format rather than GetMixFormat (E_NOTIMPL).
        let format = WAVEFORMATEX {
            wFormatTag: 3,
            nChannels: 2,
            nSamplesPerSec: 48_000,
            nAvgBytesPerSec: 384_000,
            nBlockAlign: 8,
            wBitsPerSample: 32,
            cbSize: 0,
        };
        client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
            1_000_000,
            0,
            &format,
            None,
        )?;
        let reader = client.GetService()?;
        client.Start()?;
        Ok(Self {
            client,
            reader,
            process,
            analyzer: Analyzer::new(48_000, 2),
            packets: 0,
        })
    }
    /// Drain a bounded amount of audio. Buffers are released before returning,
    /// and no allocation or IPC occurs while a WASAPI packet is borrowed.
    pub fn drain(&mut self) -> Result<bool, String> {
        unsafe { self.drain_inner().map_err(|e| e.to_string()) }
    }
    unsafe fn drain_inner(&mut self) -> windows::core::Result<bool> {
        let mut exit = 0;
        GetExitCodeProcess(self.process.0, &mut exit)?;
        if exit != 259 {
            return Err(windows::core::Error::from_hresult(HRESULT(
                0x80070490u32 as i32,
            )));
        }
        let mut received = false;
        for _ in 0..64 {
            if self.reader.GetNextPacketSize()? == 0 {
                break;
            }
            let mut ptr = std::ptr::null_mut();
            let mut frames = 0;
            let mut flags = 0;
            self.reader
                .GetBuffer(&mut ptr, &mut frames, &mut flags, None, None)?;
            if flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY.0 as u32 != 0 {
                self.analyzer.clear();
            }
            if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || ptr.is_null() {
                self.analyzer.clear();
            } else {
                self.analyzer.push(std::slice::from_raw_parts(
                    ptr.cast::<f32>(),
                    frames as usize * 2,
                ));
            }
            self.reader.ReleaseBuffer(frames)?;
            received = true;
            self.packets += 1;
        }
        Ok(received)
    }
}
impl Drop for Capture {
    fn drop(&mut self) {
        unsafe {
            let _ = self.client.Stop();
        }
    }
}
