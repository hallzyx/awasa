import { createRoot } from 'react-dom/client';
import { Field as BehaviorField, FieldLabel } from '@ui-sdk/react/field';
import { Input as BehaviorInput, InputClear, InputGroup } from '@ui-sdk/react/input';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@ui-sdk/react/tabs';
import { Search, X } from 'lucide-react';
import { ConnectionInstructions } from './integrations';
import { Editor } from './editor';

function SearchField({ query, label }) {
  return <BehaviorField className="field" name="q">
    <FieldLabel>{label}</FieldLabel>
    <InputGroup className="search-group">
      <Search size={16} aria-hidden="true"/>
      <BehaviorInput type="search" defaultValue={query} placeholder="Nombre o correo" maxLength={150}/>
      <InputClear aria-label="Limpiar búsqueda"><X size={16}/></InputClear>
    </InputGroup>
  </BehaviorField>;
}

function ConnectionTabs({ endpoint }) {
  return <Tabs defaultValue="claude" className="connection-tabs">
    <TabsList aria-label="Asistentes MCP" className="tab-list">
      <TabsTab value="claude">Claude Code</TabsTab><TabsTab value="chatgpt">ChatGPT</TabsTab>
    </TabsList>
    <TabsPanel value="claude"><ConnectionInstructions endpoint={endpoint} provider="claude"/></TabsPanel>
    <TabsPanel value="chatgpt"><ConnectionInstructions endpoint={endpoint} provider="chatgpt"/></TabsPanel>
  </Tabs>;
}

const islands = { editor: Editor, connection: ConnectionTabs, search: SearchField };
for (const node of document.querySelectorAll('[data-island]')) {
  const Component = islands[node.dataset.island];
  const props = JSON.parse(node.dataset.props);
  createRoot(node).render(<Component {...props}/>);
}

const menu = document.querySelector('[data-menu-toggle]');
const sidebar = document.getElementById('sidebar');
menu?.addEventListener('click', () => {
  const opened = !sidebar.classList.contains('visible');
  sidebar.classList.toggle('visible', opened);
  menu.setAttribute('aria-expanded', String(opened));
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !sidebar?.classList.contains('visible')) return;
  sidebar.classList.remove('visible');
  menu.setAttribute('aria-expanded', 'false');
  menu.focus();
});

for (const button of document.querySelectorAll('[data-copy-target]')) {
  button.addEventListener('click', async () => {
    const value = document.getElementById(button.dataset.copyTarget)?.textContent;
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = 'Copiado';
    } catch {
      const selection = window.getSelection();
      selection.selectAllChildren(document.getElementById(button.dataset.copyTarget));
      button.textContent = 'Seleccionado';
    }
    setTimeout(() => { button.textContent = original; }, 2200);
  }, { once: false });
}

const role = document.querySelector('[data-role-select]');
role?.addEventListener('change', () => {
  document.querySelector('[data-lead-field]').hidden = role.value !== 'member';
});

for (const form of document.querySelectorAll('[data-confirm]')) {
  form.addEventListener('submit', event => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
}

const editorForm = document.getElementById('form-editor');
editorForm?.addEventListener('invalid', event => {
  let parent = event.target.closest('details');
  while (parent) {
    parent.open = true;
    parent = parent.parentElement.closest('details');
  }
}, true);
