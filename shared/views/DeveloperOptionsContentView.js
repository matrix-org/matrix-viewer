import { TemplateView } from 'hydrogen-view-sdk';

class DeveloperOptionsContentView extends TemplateView {
  render(t, vm) {
    return t.div({}, [
      t.section([
        t.h4(['Toggles']),
        t.div({ className: 'DeveloperOptionsContentView_settingsFlag' }, [
          t.label({ for: 'debugActiveDateIntersectionObserver' }, [
            t.div({ className: 'DeveloperOptionsContentView_labelText' }, [
              'Show active date borders (debug ',
              t.code('IntersectionObserver'),
              ')',
            ]),
            t.div(
              { className: 'DeveloperOptionsContentView_microcopy' },
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
      t.section([t.h4('Room ID'), t.pre({}, t.code({}, vm.roomId))]),
    ]);
  }
}

module.exports = DeveloperOptionsContentView;
