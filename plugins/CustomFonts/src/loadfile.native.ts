import fs from "fs";

export function loadFontFile(filePath: string){
    try {
        const fontData = fs.readFileSync(filePath);
        const fontBase64 = fontData.toString('base64');
        const fontExtension = filePath.split('.').pop()?.toLowerCase();
        let mimeType = '';
        switch (fontExtension) {
            case 'ttf':
                mimeType = 'font/ttf';
                break;
            case 'otf':
                mimeType = 'font/otf';
                break;
            case 'woff':
                mimeType = 'font/woff';
                break;
            case 'woff2':
                mimeType = 'font/woff2';
                break;
            default:
                throw new Error('Unsupported font format');
        }
        return `data:${mimeType};base64,${fontBase64}`;
    } catch (error) {
        console.error("Error loading font file:", error);
        throw error;
    }
}