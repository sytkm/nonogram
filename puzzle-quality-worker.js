importScripts('line-logic.js', 'puzzle-quality.js');

self.onmessage = ({ data: { rows, columns, blank } }) => {
    self.postMessage(inspectPuzzleQuality(rows, columns, blank));
};
