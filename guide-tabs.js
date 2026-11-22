function setupGuideTabs(dialog) {
    const tabs = [...dialog.querySelectorAll('[role="tab"]')];
    const panels = [...dialog.querySelectorAll('[role="tabpanel"]')];
    const content = dialog.querySelector('.guide-content');

    function selectTab(selected, focus = false) {
        for (const tab of tabs) {
            const active = tab === selected;
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
        }
        for (const panel of panels) {
            panel.hidden = panel.id !== selected.getAttribute('aria-controls');
        }
        content.scrollTop = 0;
        if (focus) selected.focus();
    }

    for (const [index, tab] of tabs.entries()) {
        tab.onclick = () => selectTab(tab);
        tab.onkeydown = event => {
            let next;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            else return;
            event.preventDefault();
            selectTab(tabs[next], true);
        };
    }
    return () => selectTab(tabs[0]);
}
