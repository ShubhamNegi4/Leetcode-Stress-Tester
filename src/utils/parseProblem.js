const cheerio = require('cheerio');

function extractSamples(htmlContent) {
    const $ = cheerio.load(htmlContent);
    const samples = [];
    
    // First try: Standard LeetCode sample format
    $('pre').each((_, pre) => {
        const text = $(pre).text();
        if (!text) return;
        
        // Try to find input and output markers
        const inputMatch = text.match(/Input\s*:\s*([\s\S]*?)(?=Output\s*:)/i);
        const outputMatch = text.match(/Output\s*:\s*([\s\S]*?)(?=Explanation\s*:|$)/i);
        
        if (inputMatch && outputMatch) {
            samples.push({
                input: inputMatch[1].trim() + '\n',
                output: outputMatch[1].trim() + '\n'
            });
        } else {
            // Fallback: Split by lines
            const lines = text.trim().split('\n');
            if (lines.length >= 2) {
                samples.push({
                    input: lines[0].trim() + '\n',
                    output: lines[1].trim() + '\n'
                });
            }
        }
    });
    
    return samples;
}

module.exports = { extractSamples };