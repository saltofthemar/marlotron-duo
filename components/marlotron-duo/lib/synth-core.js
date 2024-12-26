// Initialize variables to manage the state of the synth and set defaults
window.synthMode = 'standby'; // Defaults to standby mode, controls active oscillators
window.ribbonMode = 'chromatic'; // Default ribbon mode (chromatic, major, minor, bypass)
window.isDroneMode = false; // When true, notes continue playing after ribbon is released
window.currentNote = null; // Keeps track of the currently playing note
window.baseFrequency = 440; // The fundamental frequency for the synth
window.xModIntensity = 0; // Amount of cross-modulation from VCO2 to VCO1
window.isRibbonPressed = false; // Tracks if the ribbon is being pressed

// Initialize the Web Audio context with Tone.js (browsers require interaction to start audio)
Tone.context.resume();

// Initialize two oscillators with sawtooth waveforms to match the Monotron Duo's VCO1 and VCO2 
// The Monotron Duo uses two identical sawtooth core oscillators, with VCO2 capable of 
// both audio-rate modulation and pitch tracking
window.oscillators = {
    vco1: { // VCO1 is the carrier oscillator, receiving modulation from VCO2
        instance: new Tone.Oscillator(32.7, "sawtooth") // Start at C1
    },
    vco2: { // VCO2 is the modulator oscillator, with wider pitch range below center
        instance: new Tone.Oscillator(82.41, "sawtooth") // Start at E2
    }
};

// Create VCF (Voltage Controlled Filter) to handle the cutoff and peak (resonance)
// The Monotron Duo uses an MS-20 style -12dB/octave lowpass filter design
window.vcf = new Tone.Filter({ 
    type: "lowpass",
    frequency: 20000, // Sets the initial frequency to 20kHz(full open)
    rolloff: -12, // -12dB/octave slope matches the original hardware's filter slope
    Q: 1, // Sets the initial peak (resonance) to 1
    gain: 1 // Compensate for resonance loss at high frequencies
});

// Add a gain stage after the filter to compensate for resonance
// This mimics the hardware's behavior where resonance doesn't reduce overall volume
window.filterCompensation = new Tone.Gain(1).toDestination();

// Create a mixer node to combine VCO1 and VCO2
// In the hardware, this is a simple voltage summer before the filter
window.mixer = new Tone.Gain();

// Create gain nodes for controlling the volume of each oscillator
// These correspond to the internal VCAs in the hardware
window.vco1Output = new Tone.Gain(0);
window.vco2Output = new Tone.Gain(0);

// Create another gain node for X-MOD intensity control
// This models the hardware's voltage-controlled attenuator for the FM signal path
window.xModGain = new Tone.Gain(0);

// Set up the audio routing chain to match the hardware signal path:
// VCO1 → VCA1 ─┐
//              └→ Mixer → VCF → Filter Compensation → Destination (Speakers)
// VCO2 → VCA2 ─┘     
//     └→ X-MOD → VCO1 FM
oscillators.vco1.instance.connect(vco1Output);
oscillators.vco2.instance.connect(vco2Output);
vco1Output.connect(mixer);
vco2Output.connect(mixer);
mixer.connect(vcf);
vcf.connect(filterCompensation);

// Connect VCO2 to VCO1's frequency for cross-modulation (X-Mod)
// This creates the characteristic FM sound of the Monotron Duo
oscillators.vco2.instance.connect(xModGain);
xModGain.connect(oscillators.vco1.instance.frequency);

// Start oscillators
oscillators.vco1.instance.start();
oscillators.vco2.instance.start();

// Set initial VCO gains to 0 (zero volume until ribbon is pressed)
vco1Output.gain.setValueAtTime(0, Tone.now());
vco2Output.gain.setValueAtTime(0, Tone.now());

// Define scale patterns (semitones from root)
window.scales = {
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10]
};

// Returns the note number for a given note string (e.g. "C4" => 60)
window.getNoteNumber = function(note) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = parseInt(note.slice(-1));
    const noteName = note.slice(0, -1);
    return octave * 12 + noteNames.indexOf(noteName);
}

// Returns the closest note number from a scale pattern to a given note number
window.getClosestScaleNote = function(noteNumber, scale) {
    const scalePattern = scales[scale];
    const octave = Math.floor(noteNumber / 12);
    const noteInOctave = noteNumber % 12;
    
    let closestNote = scalePattern[0];
    let minDistance = 12;
    
    for (const scaleNote of scalePattern) {
        const distance = Math.abs(noteInOctave - scaleNote);
        if (distance < minDistance) {
            minDistance = distance;
            closestNote = scaleNote;
        }
    }
    
    return octave * 12 + closestNote;
}

// Converts a note number to a frequency in Hz, using A4 as 440Hz reference
window.noteNumberToFrequency = function(noteNumber) {
    return 440 * Math.pow(2, (noteNumber - 69) / 12);
}

// Updates the oscillator frequencies based on UI sliders
window.updateOscillatorFrequencies = function() {
    // Calculate VCO1 frequency with standard octave response
    const vco1NormalizedPitch = (parseFloat(UI.vco1PitchSlider.value) - 50) / 50;
    const vco1Multiplier = Math.pow(2, vco1NormalizedPitch * 1.1);
    const vco1Frequency = baseFrequency * vco1Multiplier;
    
    // Calculate VCO2 frequency with asymmetric pitch range
    const vco2NormalizedPitch = (parseFloat(UI.vco2PitchSlider.value) - 50) / 50;
    // Hardware VCO2 has wider range below center frequency (-3 octaves) than above (+1 octave)
    // This asymmetry is characteristic of the Monotron Duo's design
    const vco2PitchRange = vco2NormalizedPitch < 0 ? 3 : 0.95;
    const vco2Multiplier = Math.pow(2, vco2NormalizedPitch * vco2PitchRange);
    const vco2Frequency = vco1Frequency * vco2Multiplier;
    
    // Update oscillator frequencies with smooth transitions
    oscillators.vco1.instance.frequency.linearRampToValueAtTime(vco1Frequency, Tone.now() + 0.005);
    oscillators.vco2.instance.frequency.linearRampToValueAtTime(vco2Frequency, Tone.now() + 0.005);

    // Update LED pulse rate
    updateLEDPulseRate(vco1Frequency, vco2Frequency);
    // Debug logging
    logOscillatorState(vco1Frequency, vco2Frequency);
}

// Updates the LED pulse rate based on the mixer output frequency
window.updateLEDPulseRate = function(vco1Frequency, vco2Frequency) {
    if (!UI.vco2LED || synthMode === 'standby') {
        if (UI.vco2LED) {
            UI.vco2LED.style.removeProperty('--pulse-duration');
        }
        return;
    }

    // Get the highest frequency passing through the mixer
    const activeFreq = Math.max(vco1Frequency, vco2Frequency);
    const ledFreq = activeFreq / 16;
    
    let duration;
    if (ledFreq < 30) {
        duration = 1000 / ledFreq;
    } else {
        const logFreq = Math.log2(ledFreq / 30);
        const logMax = Math.log2(20000 / 30);
        duration = 33 - (logFreq / logMax) * 28;
    }
    UI.vco2LED.style.setProperty('--pulse-duration', `${duration}ms`);
}

// Debug logging for monitoring oscillator frequencies
window.logOscillatorState = function(vco1Freq, vco2Freq) {
    const vco1Note = Tone.Frequency(vco1Freq).toNote();
    const vco2Note = Tone.Frequency(vco2Freq).toNote();

    console.log(`
Oscillator States:
----------------
VCO1: ${vco1Freq.toFixed(1)}Hz (${vco1Note})
VCO2: ${vco2Freq.toFixed(1)}Hz (${vco2Note})
Ratio: ${(vco2Freq/vco1Freq).toFixed(2)}x
`);
}

// Function to start the audio context
window.startAudioContext = function() {
    if (Tone.context.state !== 'running') {
        Tone.context.resume().then(() => {
            console.log('Audio context resumed successfully');
        });
    }
}

// Core synth functions for playing and stopping notes
window.playSynthNote = function(note) {
    
    // Don't play any notes if synth is in standby
    if (window.synthMode === 'standby') {
        console.log('Synth in standby mode, not playing');
        return;
    }

    // Make sure the audio context is started
    startAudioContext();
    
    window.currentNote = note;
    console.log('Setting base frequency for note:', note);
    window.baseFrequency = noteNumberToFrequency(getNoteNumber(note));
    
    // Enable appropriate oscillators
    if (window.synthMode === 'vco1') {
        vco1Output.gain.setValueAtTime(1, Tone.now());
    } else if (window.synthMode === 'vco1and2') {
        vco1Output.gain.setValueAtTime(1, Tone.now());
        vco2Output.gain.setValueAtTime(1, Tone.now());
    }
    
    updateOscillatorFrequencies();
}

// Function to stop playing a note (used when not in drone mode)
window.stopSynthNote = function() {
    if (!window.isDroneMode) {
        window.currentNote = null;
        vco1Output.gain.setValueAtTime(0, Tone.now());
        vco2Output.gain.setValueAtTime(0, Tone.now());
    }
}