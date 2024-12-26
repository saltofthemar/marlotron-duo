// Create the MarlotronDuo module
const MarlotronDuo = {
    async init(container) {
        try {
            // Load dependencies
            await this.loadDependencies();
            
            // Fetch and insert the template
            const response = await fetch('components/marlotron-duo/template.html');
            const html = await response.text();
            
            // Create a temporary div to hold the template
            const temp = document.createElement('div');
            temp.innerHTML = html;
            
            // Get the actual template content
            const template = temp.querySelector('.marlotron-duo');
            container.appendChild(template);

            // Initialize the interface now that template is loaded
            if (typeof initializeInterface === 'function') {
                initializeInterface();
            } else {
                console.error('Interface initialization function not found');
            }
            
        } catch (error) {
            console.error('Error initializing MarlotronDuo:', error);
        }
    },

    async loadDependencies() {
        // Load interface.js
        const interfaceScript = document.createElement('script');
        interfaceScript.src = 'components/marlotron-duo/lib/interface.js';
        document.head.appendChild(interfaceScript);

        // Load synth-core.js
        const synthCoreScript = document.createElement('script');
        synthCoreScript.src = 'components/marlotron-duo/lib/synth-core.js';
        document.head.appendChild(synthCoreScript);

        // Load dial.js
        const dialScript = document.createElement('script');
        dialScript.src = 'components/marlotron-duo/lib/dial.js';
        document.head.appendChild(dialScript);

        // Wait for all scripts to load
        await Promise.all([
            new Promise(resolve => interfaceScript.onload = resolve),
            new Promise(resolve => synthCoreScript.onload = resolve),
            new Promise(resolve => dialScript.onload = resolve)
        ]);
    }
};

// Export the module
window.MarlotronDuo = MarlotronDuo;