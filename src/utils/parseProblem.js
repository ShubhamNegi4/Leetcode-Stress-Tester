/**
 * sampleTestCase is a single string containing one or more
 * newline-separated JSON arguments for each sample.
 *
 * e.g. "[2,7,11,15]\n9\n\n[3,2,4]\n6"
 *
 * We'll split on *two* newlines to get each sample block,
 * then use its lines as stdin for our C++ programs.
 */
function extractSamples(sampleTestCase) {
  return sampleTestCase
    .trim()
    .split(/\n\s*\n/)
    .map(block => {
      // each block is N lines; we pass them verbatim as stdin:
      const lines = block.trim().split('\n');
      return { input: lines.join('\n') + '\n' };
    });
}

module.exports = { extractSamples };
