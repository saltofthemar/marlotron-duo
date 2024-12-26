class Dial {
    constructor(container) {
        this.container = container;
        this.input = container.querySelector('.dial-input');
        this.visual = container.querySelector('.dial-visual');
        
        // Configuration
        this.minRotation = -135; // degrees
        this.maxRotation = 135;  // degrees
        this.sensitivity = 1.5;  // Lower = less sensitive
        
        // Track movement
        this.lastY = null;
        
        // Replace default input handling with custom events
        this.input.style.pointerEvents = 'none';
        this.visual.style.pointerEvents = 'auto';
        
        // Bind methods
        this.onStart = this.onStart.bind(this);
        this.onMove = this.onMove.bind(this);
        this.onEnd = this.onEnd.bind(this);
        
        // Add mouse event listeners
        this.visual.addEventListener('mousedown', this.onStart);
        
        // Add touch event listeners
        this.visual.addEventListener('touchstart', this.onStart, { passive: false });
        
        // Initial position
        this.updateDial();
    }
    
    onStart(e) {
        // Prevent scrolling on touch devices
        if (e.type === 'touchstart') {
            e.preventDefault();
            this.lastY = e.touches[0].clientY;
            document.addEventListener('touchmove', this.onMove, { passive: false });
            document.addEventListener('touchend', this.onEnd);
        } else {
            this.lastY = e.clientY;
            document.addEventListener('mousemove', this.onMove);
            document.addEventListener('mouseup', this.onEnd);
            this.visual.style.cursor = 'grabbing';
        }
    }
    
    onMove(e) {
        if (this.lastY === null) return;
        
        // Get current Y position based on event type
        const currentY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        
        // Prevent scrolling on touch devices
        if (e.type === 'touchmove') {
            e.preventDefault();
        }
        
        const deltaY = this.lastY - currentY;
        this.lastY = currentY;
        
        // Apply sensitivity to the movement
        const currentValue = parseInt(this.input.value);
        const range = parseInt(this.input.max) - parseInt(this.input.min);
        const step = (deltaY * this.sensitivity * range) / 100;
        
        // Update the input value
        this.input.value = Math.min(
            parseInt(this.input.max),
            Math.max(parseInt(this.input.min), currentValue + step)
        );
        
        // Trigger input event for synth update
        this.input.dispatchEvent(new Event('input'));
        
        // Update visual
        this.updateDial();
    }
    
    onEnd(e) {
        this.lastY = null;
        document.removeEventListener('mousemove', this.onMove);
        document.removeEventListener('mouseup', this.onEnd);
        document.removeEventListener('touchmove', this.onMove);
        document.removeEventListener('touchend', this.onEnd);
        this.visual.style.cursor = 'grab';
    }
    
    updateDial() {
        const value = parseInt(this.input.value);
        const min = parseInt(this.input.min);
        const max = parseInt(this.input.max);
        
        const percentage = (value - min) / (max - min);
        const rotation = this.minRotation + (percentage * (this.maxRotation - this.minRotation));
        
        this.visual.style.transform = `rotate(${rotation}deg)`;
    }
}

// Export initialization function
window.initializeDials = () => {
    const dials = document.querySelectorAll('.dial');
    dials.forEach(container => new Dial(container));
};
