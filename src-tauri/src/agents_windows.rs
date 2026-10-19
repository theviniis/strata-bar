use windows::Win32::{
    Foundation::{CloseHandle, ERROR_NO_MORE_FILES, HANDLE},
    System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    },
};

struct SnapshotHandle(HANDLE);
impl Drop for SnapshotHandle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

pub fn process_names() -> Result<Vec<String>, String> {
    unsafe {
        let snapshot = SnapshotHandle(
            CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).map_err(|error| error.to_string())?,
        );
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut result = Vec::new();
        let mut next = Process32FirstW(snapshot.0, &mut entry);
        loop {
            match next {
                Ok(()) => {
                    let end = entry
                        .szExeFile
                        .iter()
                        .position(|c| *c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    result.push(String::from_utf16_lossy(&entry.szExeFile[..end]));
                }
                Err(error)
                    if error.code()
                        == windows::core::HRESULT::from_win32(ERROR_NO_MORE_FILES.0) =>
                {
                    return Ok(result)
                }
                Err(error) => return Err(error.to_string()),
            }
            next = Process32NextW(snapshot.0, &mut entry);
        }
    }
}
