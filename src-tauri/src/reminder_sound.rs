use std::sync::LazyLock;
use windows::{
    core::PCWSTR,
    Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY, SND_NODEFAULT},
};

// PlaySound's asynchronous memory must remain valid until playback finishes.
static WAVE: LazyLock<Vec<u8>> = LazyLock::new(alert_wave);

fn alert_wave() -> Vec<u8> {
    const RATE: u32 = 22_050;
    let count = RATE * 3 / 5;
    let bytes = count * 2;
    let mut wave = Vec::with_capacity(44 + bytes as usize);
    wave.extend_from_slice(b"RIFF");
    wave.extend_from_slice(&(36 + bytes).to_le_bytes());
    wave.extend_from_slice(b"WAVEfmt ");
    wave.extend_from_slice(&16u32.to_le_bytes());
    wave.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wave.extend_from_slice(&1u16.to_le_bytes()); // mono
    wave.extend_from_slice(&RATE.to_le_bytes());
    wave.extend_from_slice(&(RATE * 2).to_le_bytes());
    wave.extend_from_slice(&2u16.to_le_bytes());
    wave.extend_from_slice(&16u16.to_le_bytes());
    wave.extend_from_slice(b"data");
    wave.extend_from_slice(&bytes.to_le_bytes());
    for index in 0..count {
        let time = f64::from(index) / f64::from(RATE);
        let segment = (time / 0.3).floor();
        let local = time - segment * 0.3;
        let envelope = (local / 0.01).min(1.0) * ((0.3 - local) / 0.04).min(1.0);
        let frequency = if segment == 0.0 { 880.0 } else { 660.0 };
        let value = ((std::f64::consts::TAU * frequency * time).sin()
            * envelope
            * 0.25
            * f64::from(i16::MAX)) as i16;
        wave.extend_from_slice(&value.to_le_bytes());
    }
    wave
}

pub fn play() -> windows::core::Result<()> {
    // SND_MEMORY selects our PCM rather than a potentially disabled system alias.
    unsafe {
        PlaySoundW(
            PCWSTR(WAVE.as_ptr().cast()),
            None,
            SND_MEMORY | SND_ASYNC | SND_NODEFAULT,
        )
        .ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alert_is_a_complete_non_silent_pcm_wave() {
        let wave = alert_wave();
        assert_eq!(&wave[..4], b"RIFF");
        assert_eq!(&wave[8..16], b"WAVEfmt ");
        assert_eq!(&wave[36..40], b"data");
        let data_size = u32::from_le_bytes(wave[40..44].try_into().unwrap()) as usize;
        assert_eq!(data_size, 22_050 * 3 / 5 * 2);
        assert_eq!(wave.len(), data_size + 44);
        let riff_size = u32::from_le_bytes(wave[4..8].try_into().unwrap()) as usize;
        assert_eq!(riff_size + 8, wave.len());
        assert!(wave[44..].iter().any(|byte| *byte != 0));
    }
}
