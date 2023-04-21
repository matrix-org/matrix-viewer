import { TemplateView } from 'hydrogen-view-sdk';

class HomeserverSelectionModalContentView extends TemplateView {
  render(t, vm) {
    const serverNameInput = t.input({
      type: 'text',
      className: 'GeneralForm_textField',
      placeholder: 'Server name (matrix.org)',
      autofocus: true,
    });

    return t.div({}, [
      t.form(
        {
          method: 'dialog',
          onSubmit: (/*event*/) => {
            vm.onNewHomeserverAdded(serverNameInput.value);
          },
        },
        [
          t.section([
            t.p(['Enter the name of a new server you want to explore.']),
            serverNameInput,
            t.footer({ className: 'ModalView_footerActionBar' }, [
              t.button({ className: 'PrimaryActionButton' }, 'Add'),
            ]),
          ]),
        ]
      ),
    ]);
  }
}

export default HomeserverSelectionModalContentView;
