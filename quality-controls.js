const puzzleQualityWorkerURL = 'puzzle-quality-worker.js';

function requestPuzzleQuality(data) {
    let worker;
    let timeout;
    let finish;
    const result = new Promise(resolve => {
        finish = outcome => {
            window.clearTimeout(timeout);
            worker?.terminate();
            worker = undefined;
            resolve(outcome);
        };
        try {
            worker = new Worker(puzzleQualityWorkerURL);
            worker.onmessage = event => finish(event.data);
            worker.onerror = () => finish('unavailable');
            timeout = window.setTimeout(() => finish('inconclusive'), 3000);
            worker.postMessage(data);
        } catch {
            finish('unavailable');
        }
    });
    return { result, cancel: () => finish('cancelled') };
}

function setupQualityCheck(button, output, readClues) {
    const messages = {
        unique: '答えは一つです。',
        multiple: 'ヒント数字を満たす答えが複数あります。',
        inconclusive: 'この問題は検査の上限内で判定できませんでした。',
        none: 'ヒント数字を満たす答えが見つかりませんでした。',
    };
    let request;

    function reset() {
        request?.cancel();
        request = undefined;
        button.disabled = false;
        output.textContent = '';
    }

    button.onclick = async () => {
        reset();
        button.disabled = true;
        output.textContent = '答えの数を調べています…';
        const running = requestPuzzleQuality(readClues());
        request = running;
        const result = await running.result;
        if (request !== running) return;
        reset();
        output.textContent = messages[result] ?? '検査を実行できませんでした。';
    };
    return reset;
}
