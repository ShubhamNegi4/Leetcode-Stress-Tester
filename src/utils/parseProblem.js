const cheerio = require('cheerio');

/**
 * extractSamples - Parse LeetCode HTML content to pull out Input/Output samples
 * Works on Windows (CRLF), Linux & macOS (LF) by normalizing line endings
 * @param {string} htmlContent - full HTML of a LeetCode problem page
 * @returns {Array<{input: string, output: string}>} - array of sample objects
 */
function extractSamples(htmlContent) {
    // Normalize all CRLF to LF for consistent regex matching
    const normalized = htmlContent.replace(/\r\n/g, '\n');
    const $ = cheerio.load(normalized);
    const samples = [];

    $('pre').each((_, pre) => {
        // Get text block and ensure LF endings
        const block = $(pre).text().replace(/\r\n/g, '\n');

        // Attempt to capture `Input:` ... `Output:` format (support both ':' and '：')
        const inputMatch = block.match(/Input\s*[:：]\s*([\s\S]*?)(?=Output\s*[:：])/i);
        const outputMatch = block.match(/Output\s*[:：]\s*([\s\S]*?)(?=(?:Explanation|Constraints|$)\b)/i);

        if (inputMatch && outputMatch) {
            samples.push({
                input: inputMatch[1].trim() + '\n',
                output: outputMatch[1].trim() + '\n'
            });
        } else {
            // Fallback: Split by lines, take pairs
            const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
            for (let i = 0; i + 1 < lines.length; i += 2) {
                let inputLine = lines[i] + '\n';
                let outputLine = lines[i + 1] + '\n';
                // Remove 'Output:' or similar prefix from output line
                outputLine = outputLine.replace(/^Output\s*[:：]?\s*/i, '');
                samples.push({
                    input: inputLine,
                    output: outputLine
                });
            }
        }
    });

    // Remove empty samples
    return samples.filter(s => s.input.trim() && s.output.trim());
}

module.exports = { extractSamples };
