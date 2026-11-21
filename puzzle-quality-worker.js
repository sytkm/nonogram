importScripts('line-logic.js', 'puzzle-quality.js?v=line-solvability');

self.onmessage = ({ data: { rows, columns, blank, answer, fixedSlashes, check } }) => {
    let result;
    if (check === 'logic') {
        const preparation = answer ? preparePuzzleQuality(rows, columns, blank, answer) : undefined;
        result = {
            preparation,
            logic: inspectLineSolvability(rows, columns, blank, preparation?.fixedSlashes ?? fixedSlashes),
        };
    } else {
        result = answer
            ? preparePuzzleQuality(rows, columns, blank, answer)
            : inspectPuzzleQuality(rows, columns, blank, undefined, fixedSlashes);
    }
    self.postMessage(result);
};
