// 共通設定の読み書き。保存済みの盤面にある旧設定も読み取る。

const boardSettingDefaults = { stickClues: true, showSymbols: false, autoSlash: false, pickClueColor: false, tracePaint: true, paintFeedback: true };
const boardSettings = {};
const boardSettingsKey = 'nonogram.settings';

function boardSetting(name, board) {
    return boardSettings[name] ?? board?.[name] ?? boardSettingDefaults[name];
}

function saveBoardSetting(name, value) {
    boardSettings[name] = value;
    try {
        localStorage.setItem(boardSettingsKey, JSON.stringify(boardSettings));
    } catch {
        // Keep the setting in memory for this page.
    }
}

function setupSettings() {
    const dialog = document.getElementById('settings-dialog');
    const playPanel = document.getElementById('play-panel');
    const clueActions = dialog.querySelectorAll('input[name="clue-action"]');
    const settingsInputs = {
        stickClues: document.getElementById('stick-clues'),
        showSymbols: document.getElementById('color-symbols'),
        autoSlash: document.getElementById('auto-slash'),
        tracePaint: document.getElementById('trace-paint'),
        paintFeedback: document.getElementById('paint-feedback'),
    };
    try {
        const saved = JSON.parse(localStorage.getItem(boardSettingsKey));
        for (const name of Object.keys(boardSettingDefaults)) {
            if (typeof saved?.[name] === 'boolean') boardSettings[name] = saved[name];
        }
    } catch {
        // Play with defaults when browser storage is unavailable.
    }
    for (const [name, input] of Object.entries(settingsInputs)) {
        input.onchange = () => {
            saveBoardSetting(name, input.checked);
            if (!playPanel.hidden) activeBoard?.refreshSettings();
        };
    }
    for (const input of clueActions) {
        input.onchange = () => saveBoardSetting('pickClueColor', input.value === 'color');
    }
    for (const button of document.querySelectorAll('[data-open-settings]')) {
        button.onclick = () => {
            showBoardMenu();
            const board = playPanel.hidden ? undefined : activeBoard?.state;
            for (const [name, input] of Object.entries(settingsInputs)) {
                input.checked = boardSetting(name, board);
            }
            const clueAction = boardSetting('pickClueColor', board) ? 'color' : 'mark';
            for (const input of clueActions) {
                input.checked = input.value === clueAction;
            }
            dialog.showModal();
        };
    }
}
