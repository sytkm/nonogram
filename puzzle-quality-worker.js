importScripts('line-logic.js', 'puzzle-quality.js');

self.onmessage = ({ data: { rows, columns, blank, answer, fixedSlashes } }) => {
    const result = answer
        ? preparePuzzleQuality(rows, columns, blank, answer)
        : inspectPuzzleQuality(rows, columns, blank, undefined, fixedSlashes);
    self.postMessage(result);
};
