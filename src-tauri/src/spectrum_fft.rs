//! Six logarithmic power bands from real interleaved PCM. No stereo downmix:
//! opposite-phase channels must contribute energy rather than cancel each other.
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::sync::Arc;

pub const SIZE: usize = 2048;
pub const BANDS: usize = 6;

pub struct Analyzer {
    fft: Arc<dyn Fft<f32>>,
    window: Vec<f32>,
    samples: Vec<f32>,
    scratch: Vec<Complex<f32>>,
    work: Vec<Complex<f32>>,
    channels: usize,
    rate: u32,
    cursor: usize,
    filled: usize,
}
impl Analyzer {
    pub fn new(rate: u32, channels: usize) -> Self {
        assert!(rate > 0 && (1..=8).contains(&channels));
        let fft = FftPlanner::new().plan_fft_forward(SIZE);
        Self {
            scratch: vec![Complex::default(); fft.get_inplace_scratch_len()],
            fft,
            window: (0..SIZE)
                .map(|i| 0.5 - 0.5 * (std::f32::consts::TAU * i as f32 / SIZE as f32).cos())
                .collect(),
            samples: vec![0.; SIZE * channels],
            work: vec![Complex::default(); SIZE],
            channels,
            rate,
            cursor: 0,
            filled: 0,
        }
    }
    pub fn clear(&mut self) {
        self.samples.fill(0.);
        self.cursor = 0;
        self.filled = 0;
    }
    pub fn push(&mut self, pcm: &[f32]) {
        for frame in pcm.chunks_exact(self.channels) {
            for (channel, value) in frame.iter().enumerate() {
                self.samples[self.cursor * self.channels + channel] =
                    if value.is_finite() { *value } else { 0. };
            }
            self.cursor = (self.cursor + 1) % SIZE;
            self.filled = (self.filled + 1).min(SIZE);
        }
    }
    pub fn bands(&mut self) -> [f32; BANDS] {
        if self.filled < SIZE {
            return [0.; BANDS];
        }
        let mut power = [0f32; BANDS];
        let ceiling = 16_000f32.min(self.rate as f32 / 2.);
        if ceiling <= 60. {
            return power;
        }
        let ratio = ceiling / 60.;
        for channel in 0..self.channels {
            for i in 0..SIZE {
                self.work[i] = Complex::new(
                    self.samples[((self.cursor + i) % SIZE) * self.channels + channel]
                        * self.window[i],
                    0.,
                );
            }
            self.fft
                .process_with_scratch(&mut self.work, &mut self.scratch);
            for k in 1..=SIZE / 2 {
                let hz = k as f32 * self.rate as f32 / SIZE as f32;
                if hz < 60. || hz > ceiling {
                    continue;
                }
                let band = ((hz / 60.).ln() / ratio.ln() * BANDS as f32)
                    .floor()
                    .min((BANDS - 1) as f32) as usize;
                // Hann coherent gain = .5, noise bandwidth = 1.5 bins.
                // Sum bin powers so a full-scale sinusoid approaches 0 dBFS.
                power[band] += self.work[k].norm_sqr() * 16.
                    / (SIZE * SIZE) as f32
                    / 1.5
                    / self.channels as f32;
            }
        }
        power.map(|p| ((10. * p.max(1e-12).log10() + 60.) / 60.).clamp(0., 1.))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn silence_and_incomplete_windows_are_zero() {
        let mut a = Analyzer::new(48_000, 2);
        assert_eq!(a.bands(), [0.; 6]);
        a.push(&vec![0.; SIZE * 2]);
        assert_eq!(a.bands(), [0.; 6]);
        a.push(&vec![f32::NAN; SIZE * 2]);
        assert_eq!(a.bands(), [0.; 6]);
    }
    #[test]
    fn tones_land_in_their_bands_at_different_rates_without_phase_cancellation() {
        for rate in [32_000, 44_100, 48_000, 96_000] {
            for band in 0..BANDS {
                let hz = 60. * (16_000f32 / 60.).powf((band as f32 + 0.5) / 6.);
                let mut a = Analyzer::new(rate, 2);
                let pcm: Vec<_> = (0..SIZE)
                    .flat_map(|i| {
                        let x = (std::f32::consts::TAU * hz * i as f32 / rate as f32).sin() * 0.5;
                        [x, -x]
                    })
                    .collect();
                a.push(&pcm);
                let values = a.bands();
                let peak = values
                    .iter()
                    .enumerate()
                    .max_by(|a, b| a.1.total_cmp(b.1))
                    .unwrap()
                    .0;
                assert_eq!(peak, band, "rate {rate}: {values:?}");
                assert!(values[band] > 0.8);
                a.clear();
                assert_eq!(a.bands(), [0.; 6]);
            }
        }
    }
}
