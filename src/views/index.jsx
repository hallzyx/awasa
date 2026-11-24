import { renderToStaticMarkup } from 'react-dom/server';
import { Dashboard, Account } from './dashboard';
import { Login, Invitation, OAuthConsent, ErrorPage } from './access';
import { FormDetail, FormEditor, Forms, PublicForm, ApplicationView } from './recruiting';
import { People, Person, Roles } from './people';
import { Integrations } from './integrations';
import { Layout } from './shared';

const pages = {
  dashboard: Dashboard, account: Account, login: Login, invitation: Invitation, 'oauth-consent': OAuthConsent,
  error: ErrorPage, forms: Forms, 'form-detail': FormDetail, 'form-editor': FormEditor, 'public-form': PublicForm,
  application: ApplicationView, people: People, person: Person, roles: Roles, integrations: Integrations,
};

export function renderView(view, model) {
  const Page = pages[view];
  return '<!doctype html>' + renderToStaticMarkup(<Layout view={view} model={model}><Page {...model}/></Layout>);
}
