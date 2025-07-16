/**
 * Scrapes every “Example N:” block from the HTML of a LeetCode problem,
 * then pulls out exactly:
 *   - the JSON array after `nums =`
 *   - the integer after `target =`
 *   - the first line of the example’s Output
 *
 * Returns an array of { input, output } where:
 *   input  is "[...]\n<number>\n"
 *   output is the single-line answer string
 */
function extractSamples(htmlContent) {
  // 1) Strip HTML tags to plain text
  const text = htmlContent.replace(/<[^>]+>/g, '\n');

  // 2) Match each Example block: Input: … Output: … up until next Example or end
  const EXAMPLE_RE = /Example\s*\d+:\s*Input:\s*([\s\S]*?)\s*Output:\s*([\s\S]*?)(?=Example\s*\d+:|$)/g;

  const samples = [];
  let m;
  while ((m = EXAMPLE_RE.exec(text)) !== null) {
    const rawInputBlock  = m[1];           // e.g. "nums = [2,7,11,15], target = 9"
    const rawOutputBlock = m[2].trim();    // e.g. "[0,1]\nExplanation: …"

    // pull out the two pieces from the Input line
    const arrMatch = /nums\s*=\s*(\[[^\]]+\])/.exec(rawInputBlock);
    const tgtMatch = /target\s*=\s*([-]?\d+)/.exec(rawInputBlock);
    if (!arrMatch || !tgtMatch) continue;  // skip malformed blocks

    // only take the very first line of the Output (the JSON answer)
    const answerLine = rawOutputBlock.split('\n')[0].trim();

    samples.push({
      input:  `${arrMatch[1]}\n${tgtMatch[1]}\n`,
      output: answerLine
    });
  }

  return samples;
}

// **Export for CommonJS**
module.exports = {
  extractSamples
};
