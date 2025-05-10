import { encodeQR } from 'qr';

document.addEventListener('DOMContentLoaded', () => {
    const terminalOutput = document.getElementById('terminal-output');
    const qrCodeContainer = document.getElementById('qr-code-container');
    const cursor = document.querySelector('.cursor');
    const headerText = 'barbarcode>';
    const headerElement = document.querySelector('header h1');

    const demoPublicUrl = 'https://shiny-random-name.ngrok-free.app'; // Example ngrok free URL

    // Clear initial header text for typing animation
    if (headerElement) {
        headerElement.innerHTML = ''; // Keep only the cursor if it's part of the h1
    }

    const lines = [
        { text: '> barbarcode -p 8080 -s inventory_input', speed: 25 }, // Reduced from 50
        { text: 'Server starting on port 8080...', speed: 15 },        // Reduced from 30
        { text: 'Session type: inventory_input', speed: 15 },        // Reduced from 30
        { text: 'Generating QR code for client connection...', speed: 15 }, // Reduced from 30
        { text: `Ngrok tunnel established at: ${demoPublicUrl}`, speed: 20, isNgrokUrl: true }, // Reduced from 40
        { text: 'Scan the QR code below with your mobile device:', speed: 15, isQRCodePrompt: true } // Reduced from 30
    ];

    let lineIndex = 0;
    let charIndex = 0;

    function typeHeaderText() {
        if (charIndex < headerText.length) {
            if (headerElement) {
                headerElement.innerHTML = headerText.substring(0, charIndex + 1) + '<span class="cursor"></span>';
            }
            charIndex++;
            setTimeout(typeHeaderText, 50); // Reduced from 100
        } else {
            charIndex = 0; // Reset for terminal animation
            typeTerminalLine(); // Start terminal animation after header
        }
    }

    function typeTerminalLine() {
        if (lineIndex < lines.length) {
            const currentLine = lines[lineIndex];
            const p = lineIndex === 0 && terminalOutput.querySelector('p') ? terminalOutput.querySelector('p') : document.createElement('p');
            if (lineIndex > 0 || !terminalOutput.querySelector('p')) {
                terminalOutput.appendChild(p);
            }
            
            typeChar(p, currentLine, 0);
        } else {
            // All lines typed
            if (cursor) cursor.style.display = 'none'; // Hide cursor after animation
        }
    }

    function typeChar(element, lineConfig, charIdx) {
        if (charIdx < lineConfig.text.length) {
            element.textContent = lineConfig.text.substring(0, charIdx + 1);
            setTimeout(() => typeChar(element, lineConfig, charIdx + 1), lineConfig.speed);
        } else {
            // Line finished typing
            if (lineConfig.isNgrokUrl) {
                // Potentially make this a clickable link
            }
            if (lineConfig.isQRCodePrompt) {
                displayQRCode();
            }
            lineIndex++;
            setTimeout(typeTerminalLine, 250); // Reduced from 500
        }
    }

    function displayQRCode() {
        try {
            // Generate SVG string for the QR code
            // encodeQR(text, type, errorCorrectLevel, margin)
            // Type 'svg' for SVG output. 'M' is a common error correction level.
            const svgString = encodeQR(demoPublicUrl, 'svg', 'M');
            
            qrCodeContainer.innerHTML = ''; // Clear previous content (e.g., placeholder img)
            qrCodeContainer.innerHTML = svgString; // Insert SVG string

            // The CSS will style the SVG element
        } catch (error) {
            console.error("Error generating QR code:", error);
            qrCodeContainer.innerHTML = '<p style="color: red;">Error generating QR code.</p>';
        }
    }

    // Create a placeholder image for mobile scan section if it doesn't exist
    const mobileScanImg = document.getElementById('mobile-scan-img');
    if (mobileScanImg && !mobileScanImg.src.includes('placeholder')) {
        // Assuming you have a placeholder, otherwise this logic might need adjustment
        // For the demo, we ensure it points to a placeholder if not already set.
    }

    // Start the animation
    typeHeaderText();
});
