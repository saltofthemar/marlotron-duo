// Initialize UI Elements for the Marlotron Duo
let UI;

function initializeInterface() {
    
    // Initialize UI elements after template is loaded
    UI = {
        // Mode switches for controlling synth behavior
        synthModeInputs: document.querySelectorAll('input[name="synth-mode"]'),
        ribbonModeInputs: document.querySelectorAll('input[name="ribbon-mode"]'),
        ribbonModeButton: document.querySelector('#ribbon-mode-button'),
        
        // Sliders for controlling various synth parameters
        vco1PitchSlider: document.querySelector('#vco1-pitch'),
        vco2PitchSlider: document.querySelector('#vco2-pitch'),
        xModSlider: document.querySelector('#xmod-intensity'),
        vcfCutoffSlider: document.querySelector('#vcf-cutoff'),
        vcfPeakSlider: document.querySelector('#vcf-peak'),
        
        // Other UI elements
        droneToggle: document.querySelector('#drone-toggle'),
        vco2LED: document.querySelector('.vco2-glow'),
        ribbonKeyboard: document.querySelector('.ribbon-keyboard'),
        statusAlert: document.querySelector('#status'),
    };

    // Verify that we have all required UI elements
    if (!UI.vcfCutoffSlider || !UI.droneToggle || !UI.ribbonKeyboard) {
        console.error('Missing required UI elements:', {
            vcfCutoffSlider: !!UI.vcfCutoffSlider,
            droneToggle: !!UI.droneToggle,
            ribbonKeyboard: !!UI.ribbonKeyboard
        });
        return;
    }

    // Initialize VCF cutoff and peak filters
    UI.vcfCutoffSlider.value = 100; // Start with filter fully open
    vcf.frequency.value = 20000; // Set initial cutoff frequency

    // Initialize dials
    if (typeof window.initializeDials === 'function') {
        window.initializeDials();
    }

    // Add event listeners for synth mode
    UI.synthModeInputs.forEach(radio => {
        radio.addEventListener('change', (e) => {
            console.log('Synth mode changed:', e.target.value);
            window.synthMode = e.target.value;
            
            if (window.synthMode !== 'standby') {
                startAudioContext();
            }
            
            switch (window.synthMode) {
                case 'standby':
                    // Turn everything off in standby mode
                    vco1Output.gain.setValueAtTime(0, Tone.now());
                    vco2Output.gain.setValueAtTime(0, Tone.now());
                    
                    // Reset drone mode if active
                    if (window.isDroneMode) {
                        window.isDroneMode = false;
                        UI.droneToggle.classList.remove('active');
                    }
                    
                    // Stop any playing notes
                    if (window.currentNote) {
                        window.stopSynthNote();
                        window.currentNote = null;
                    }
                    
                    updateVCO2LED();
                    break;
                case 'vco1':
                case 'vco1and2':
                    // Update LED state
                    updateVCO2LED();
                    
                    // Set oscillator gains based on current state
                    const isPlaying = window.currentNote || window.isDroneMode;
                    vco1Output.gain.setValueAtTime(isPlaying ? 1 : 0, Tone.now());
                    vco2Output.gain.setValueAtTime(
                        (isPlaying && window.synthMode === 'vco1and2') ? 1 : 0, 
                        Tone.now()
                    );
                    break;
            }
            
            // Update oscillator frequencies in case we're in drone mode
            if (window.isDroneMode && window.currentNote) {
                updateOscillatorFrequencies();
            }
        });
    });

    // Add event listeners for pitch sliders
    UI.vco1PitchSlider.addEventListener("input", updateOscillatorFrequencies);
    UI.vco2PitchSlider.addEventListener("input", updateOscillatorFrequencies);

    // Add event listener for X-MOD intensity
    UI.xModSlider.addEventListener("input", () => {
        // X-MOD follows exponential curve (^1.5) to match hardware response
        // Depth is proportional to VCO1 frequency to maintain consistent modulation character
        const intensity = parseFloat(UI.xModSlider.value);
        const normalizedIntensity = Math.pow(intensity / 10, 1.5);
        const vco1Freq = oscillators.vco1.instance.frequency.value;
        const modulationDepth = normalizedIntensity * vco1Freq * 2;
        
        xModGain.gain.linearRampToValueAtTime(modulationDepth, Tone.now() + 0.005);
    });

    // Add VCF cutoff control (20Hz - 8kHz) sweeps audible range
    UI.vcfCutoffSlider.addEventListener("input", () => {
        // MS-20 filter characteristics:
        // - Exponential frequency response (20Hz - 8kHz matches hardware range)
        // - Intentionally limited upper range to ensure filter effect is always present
        // - Compensation gain increases with frequency to maintain consistent resonance
        const normalizedCutoff = parseFloat(UI.vcfCutoffSlider.value) / 100;
        const minFreq = 20;
        const maxFreq = 8000;
        const cutoffFreq = minFreq * Math.pow(maxFreq/minFreq, normalizedCutoff);
        vcf.frequency.linearRampToValueAtTime(cutoffFreq, Tone.now() + 0.005);
        
        // Adjust compensation based on cutoff to maintain resonance strength
        const compensation = 1 + (normalizedCutoff * 0.5);
        filterCompensation.gain.linearRampToValueAtTime(compensation, Tone.now() + 0.005);
    });

    // Add VCF peak/resonance control (Q: 0.5 - 50)
    UI.vcfPeakSlider.addEventListener("input", () => {
        // MS-20 filter resonance characteristics:
        // - Exponential response for more dramatic high-end resonance
        // - Q range from 0.5 to 50 matches hardware's extreme resonance capability
        // - Additional gain compensation at high resonance to prevent volume loss
        const normalizedPeak = parseFloat(UI.vcfPeakSlider.value) / 100;
        const minQ = 0.5;
        const maxQ = 50;
        const q = minQ + Math.pow(normalizedPeak, 2.5) * (maxQ - minQ);
        vcf.Q.linearRampToValueAtTime(q, Tone.now() + 0.005);
        
        // Hardware compensates for volume loss at high resonance
        const compensationAmount = 1 + (Math.pow(normalizedPeak, 2) * 0.5);
        filterCompensation.gain.linearRampToValueAtTime(compensationAmount, Tone.now() + 0.005);
    });

    // Add ribbon mode event listeners
    UI.ribbonModeInputs.forEach(radio => {
        radio.addEventListener('change', (e) => {
            console.log('Ribbon mode changed:', e.target.value);
            window.ribbonMode = e.target.value;
            updateStatusAlert(e.target.value + ' mode');
        });
    });

    // Add ribbon mode button cycling
    UI.ribbonModeButton.addEventListener('click', () => {
        const modes = ['chromatic', 'major', 'minor', 'bypass'];
        const currentIndex = modes.indexOf(window.ribbonMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        const nextMode = modes[nextIndex];
        
        const nextRadio = document.querySelector(`input[value="${nextMode}"]`);
        if (nextRadio) {
            nextRadio.click();
        }
    });

    // Add drone toggle event listener
    UI.droneToggle.addEventListener('click', () => {
        window.isDroneMode = !window.isDroneMode;
        console.log('Drone state changed:', window.isDroneMode);
        UI.droneToggle.classList.toggle('active', window.isDroneMode);
        
        // If drone is turned off, stop the current note
        if (!window.isDroneMode && window.currentNote) {
            stopNote();
        }
    });

    // Add ribbon keyboard event listeners
    UI.ribbonKeyboard.addEventListener('mousedown', (e) => {
        window.isRibbonPressed = true;
        handleRibbonPress(e);
    });

    UI.ribbonKeyboard.addEventListener('mousemove', (e) => {
        if (!window.isRibbonPressed) return;
        handleRibbonMove(e);
    });

    UI.ribbonKeyboard.addEventListener('mouseup', () => {
        window.isRibbonPressed = false;
        handleRibbonRelease();
    });

    UI.ribbonKeyboard.addEventListener('mouseleave', () => {
        window.isRibbonPressed = false;
        handleRibbonRelease();
    });

    // Touch events for ribbon keyboard
    UI.ribbonKeyboard.addEventListener('touchstart', (e) => {
        window.isRibbonPressed = true;
        handleRibbonPress(e.touches[0]);
        e.preventDefault();
    });

    UI.ribbonKeyboard.addEventListener('touchmove', (e) => {
        if (!window.isRibbonPressed) return;
        handleRibbonMove(e.touches[0]);
        e.preventDefault();
    });

    UI.ribbonKeyboard.addEventListener('touchend', (e) => {
        window.isRibbonPressed = false;
        handleRibbonRelease();
        e.preventDefault();
    });
}

// Function to handle ribbon key press
function handleRibbonPress(event) {
    // Ribbon interface mimics the analog voltage divider in the hardware
    // Position detection works the same way as the original's resistive strip
    const key = event.target;
    if (!key.classList.contains('key')) return;
    
    const note = key.dataset.note;
    playNote(note);
}

// Function to handle ribbon movement
function handleRibbonMove(event) {
    // Ribbon position calculations mirror the analog voltage divider in hardware:
    // - Position is linear across ribbon length
    // - Note quantization happens after position sensing (like the hardware)
    // - Local position within key allows continuous pitch control
    if (!window.isRibbonPressed) return;
    
    const keys = Array.from(UI.ribbonKeyboard.querySelectorAll('.key'));
    const ribbonRect = UI.ribbonKeyboard.getBoundingClientRect();
    const relativeX = event.clientX - ribbonRect.left;
    const totalWidth = ribbonRect.width;
    const position = relativeX / totalWidth;

    // Find the two closest keys based on position
    const keyWidth = totalWidth / keys.length;
    const keyIndex = Math.floor(position * keys.length);
    const currentKey = keys[keyIndex];
    const nextKey = keys[keyIndex + 1];

    if (!currentKey) return;

    const currentNote = currentKey.dataset.note;
    if (!currentNote) return;

    const currentNoteNumber = getNoteNumber(currentNote);
    const localPosition = (relativeX - (keyIndex * keyWidth)) / keyWidth;

    // Handle different ribbon modes
    if (window.ribbonMode === 'bypass') {
        // Calculate continuous frequency based on position
        const currentFreq = noteNumberToFrequency(currentNoteNumber);
        const nextFreq = nextKey ? 
            noteNumberToFrequency(getNoteNumber(nextKey.dataset.note)) : 
            currentFreq * 1.059463; // semitone up if no next note
        
        // Interpolate between current and next frequency
        window.baseFrequency = currentFreq + (nextFreq - currentFreq) * localPosition;
    } else {
        // For scale modes, calculate the target note number including position
        const currentPosition = currentNoteNumber + localPosition;
        
        // Get the closest notes in the selected scale
        const currentScaleNote = getClosestScaleNote(Math.floor(currentPosition), window.ribbonMode);
        const nextScaleNote = getClosestScaleNote(Math.ceil(currentPosition), window.ribbonMode);
        
        // Interpolate between scale notes for smoother transition
        const interpolationPosition = currentPosition - Math.floor(currentPosition);
        const currentFreq = noteNumberToFrequency(currentScaleNote);
        const nextFreq = noteNumberToFrequency(nextScaleNote);
        
        window.baseFrequency = currentFreq + (nextFreq - currentFreq) * interpolationPosition;
    }

    // Enable sound output if it's not already enabled
    if (window.synthMode === 'vco1') {
        vco1Output.gain.setValueAtTime(1, Tone.now());
    } else if (window.synthMode === 'vco1and2') {
        vco1Output.gain.setValueAtTime(1, Tone.now());
        vco2Output.gain.setValueAtTime(1, Tone.now());
    }

    // Update oscillator frequencies with smooth transition
    updateOscillatorFrequencies();
}

// Function to handle ribbon key release
function handleRibbonRelease() {
    if (!window.isDroneMode) {
        stopNote();
    }
}

function playNote(note) {
    console.log('Playing note:', note);
    // Call the core synth function
    window.playSynthNote(note);
    
    // Update LED state
    updateVCO2LED();
}

function stopNote() {
    // Call the core synth function
    window.stopSynthNote();
    
    // Update LED state
    updateVCO2LED();
}

// UI Update Functions

// Update VCO2 LED state for visual feedback
function updateVCO2LED() {
    if (!UI.vco2LED) return;

    // Handle standby mode (LED completely off)
    if (window.synthMode === 'standby') {
        UI.vco2LED.classList.remove('active', 'playing');
        UI.vco2LED.style.removeProperty('--pulse-duration');
        return;
    }

    // LED is always active when synth is on
    UI.vco2LED.classList.add('active');

    // LED blinks whenever there's signal in the mixer (any mode except standby)
    if (window.currentNote || window.isDroneMode) {
        UI.vco2LED.classList.add('playing');
    } else {
        UI.vco2LED.classList.remove('playing');
        UI.vco2LED.style.removeProperty('--pulse-duration');
    }
}

// Update status alert with animation
function updateStatusAlert(message) {
    if (UI.statusAlert) {
        UI.statusAlert.textContent = message;
        // Reset animation
        UI.statusAlert.style.animation = 'none';
        UI.statusAlert.offsetHeight; // Trigger reflow
        UI.statusAlert.style.animation = 'marlotron-status-alert 5s ease-in-out';
    }
}