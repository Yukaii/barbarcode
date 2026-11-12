import { encodeQR } from 'qr';
import '../css/style.css';
import '../css/tailwind.css';

document.addEventListener('DOMContentLoaded', () => {
    const terminalOutput = document.getElementById('terminal-output');
    const qrCodeContainer = document.getElementById('qr-code-container');
    const cursor = document.querySelector('.cursor');
    const headerText = 'barbarcode>';
    const headerElement = document.querySelector('header h1');

    const demoPublicUrl = 'https://scan.barbarcode.yukai.dev/s/demo'; // Example pairing URL

    // Clear initial header text for typing animation
    if (headerElement) {
        headerElement.innerHTML = ''; // Keep only the cursor if it's part of the h1
    }

    const lines = [
        { text: '> npx barbarcode -s inventory', speed: 25 },
        { text: 'via      relay · end-to-end encrypted', speed: 15 },
        { text: 'profile  inventory  {barcode}{enter}', speed: 15 },
        { text: 'typing   macOS (osascript)', speed: 15 },
        { text: `Open: ${demoPublicUrl}`, speed: 20, isNgrokUrl: true },
        { text: "Scan this QR code with your phone's camera:", speed: 15, isQRCodePrompt: true }
    ];

    let lineIndex = 0;
    let charIndex = 0;

    function typeHeaderText() {
        if (charIndex < headerText.length) {
            if (headerElement) {
                headerElement.innerHTML = `${headerText.substring(0, charIndex + 1)}<span class="cursor"></span>`;
            }
            charIndex++;
            setTimeout(typeHeaderText, 50); // Reduced from 100
        } else {
            charIndex = 0; // Reset for terminal animation
            typeTerminalLine(); // Start terminal animation after header
        }
    }

    let terminalText = '';

    function typeTerminalLine() {
        if (lineIndex < lines.length) {
            const currentLine = lines[lineIndex];
            typeChar(currentLine, 0);
        } else {
            // All lines typed
            if (cursor) cursor.style.display = 'none'; // Hide cursor after animation
        }
    }

    function typeChar(lineConfig, charIdx) {
        if (charIdx < lineConfig.text.length) {
            terminalOutput.textContent = `${terminalText}${lineConfig.text.substring(0, charIdx + 1)}`;
            setTimeout(() => typeChar(lineConfig, charIdx + 1), lineConfig.speed);
        } else {
            // Line finished typing
            terminalText += `${lineConfig.text}\n`;
            terminalOutput.textContent = terminalText;
            if (lineConfig.isNgrokUrl) {
                // Potentially make this a clickable link
            }
            if (lineConfig.isQRCodePrompt) {
                displayQRCode();
            } else {
                lineIndex++;
                setTimeout(typeTerminalLine, 250); // Reduced from 500
            }
        }
    }

    function displayQRCode() {
        try {
            // Generate ASCII string for the QR code
            // encodeQR(text, type, errorCorrectLevel, margin)
            // Type 'ascii' for ASCII output. 'M' is a common error correction level.
            const asciiString = encodeQR(demoPublicUrl, 'ascii', 'M');
            terminalText += `${asciiString}\n`;
            terminalOutput.textContent = terminalText;
            lineIndex++;
            setTimeout(typeTerminalLine, 250);
        } catch (error) {
            console.error("Error generating QR code:", error);
            terminalText += '[Error generating QR code]\n';
            terminalOutput.textContent = terminalText;
            lineIndex++;
            setTimeout(typeTerminalLine, 250);
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
