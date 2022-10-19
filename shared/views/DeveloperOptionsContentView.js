'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

class DeveloperOptionsContentView extends TemplateView {
  render(t, vm) {
    return t.div({}, [
      t.section([
        t.h4(['Toggles']),
        t.div({ className: 'DeveloperOptionsView_settingsFlag' }, [
          t.label({ for: 'debugActiveDateIntersectionObserver' }, [
            t.div({ className: 'DeveloperOptionsView_labelText' }, [
              'Show active date borders (debug ',
              t.code('IntersectionObserver'),
              ')',
            ]),
            t.div(
              { className: 'DeveloperOptionsView_microcopy' },
              'Show red border and yellow background trail around the event that is driving the active date as you scroll around.'
            ),
          ]),
          t.input({
            id: 'debugActiveDateIntersectionObserver',
            type: 'checkbox',
            checked: (vm) => vm.debugActiveDateIntersectionObserver,
            onInput: (event) => vm.toggleDebugActiveDateIntersectionObserver(event.target.checked),
          }),
        ]),
      ]),
      t.section([t.h4('Backend timing'), 'todo: window.tracingSpansForRequest']),
    ]);
  }
}

module.exports = DeveloperOptionsContentView;