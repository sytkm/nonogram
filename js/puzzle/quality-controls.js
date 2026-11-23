const puzzleQualityWorkerURL = 'js/puzzle/puzzle-quality-worker.js?v=line-solvability';

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

function lineSolvabilityMessage(result) {
    const messages = {
        complete: '行・列の推理だけで、すべてのマスが決まりました。',
        partial: '行・列の推理は途中で止まりました。別の考え方で解ける場合があります。',
        inconclusive: '行・列の推理で解けるか、確認しきれませんでした。解けないと決まったわけではありません。',
        contradiction: 'ヒントの数字と、最初からあるマスの状態に矛盾が見つかりました。',
        unavailable: '行・列の推理で解けるか調べられませんでした。',
    };
    return messages[result?.logic ?? result] ?? messages.unavailable;
}

function setupQualityCheck(button, output, readClues, describe = describeUniqueness,
    pending = '答えの数を調べています…') {
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
        output.textContent = pending;
        const running = requestPuzzleQuality(readClues());
        request = running;
        const result = await running.result;
        if (request !== running) return;
        reset();
        output.textContent = describe(result);
    };
    return reset;
}

function describeUniqueness(result) {
    const messages = {
        unique: '答えは一つです。',
        multiple: 'ヒントの数字に合う答えが複数あります。',
        inconclusive: '答えが一つか、確認しきれませんでした。複数あると決まったわけではありません。マス数を減らしてもう一度調べられます。',
        none: 'ヒントの数字に合う答えが見つかりませんでした。',
    };
    return messages[result] ?? '検査を実行できませんでした。';
}
