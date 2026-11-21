const puzzleQualityWorkerURL = 'puzzle-quality-worker.js';

function setupQualityCheck(button, output, readClues) {
    const messages = {
        unique: '答えは一つです。',
        multiple: 'ヒント数字を満たす答えが複数あります。',
        inconclusive: 'この問題は検査の上限内で判定できませんでした。',
        none: 'ヒント数字を満たす答えが見つかりませんでした。',
    };
    let worker;
    let timeout;

    function reset() {
        worker?.terminate();
        worker = undefined;
        window.clearTimeout(timeout);
        button.disabled = false;
        output.textContent = '';
    }

    button.onclick = () => {
        reset();
        let running;
        function report(result) {
            if (worker !== running) return;
            reset();
            output.textContent = messages[result] ?? '検査を実行できませんでした。';
        }

        button.disabled = true;
        output.textContent = '答えの数を調べています…';
        try {
            running = new Worker(puzzleQualityWorkerURL);
            worker = running;
            running.onmessage = event => report(event.data);
            running.onerror = () => report();
            timeout = window.setTimeout(() => report('inconclusive'), 3000);
            running.postMessage(readClues());
        } catch {
            report();
        }
    };
    return reset;
}
