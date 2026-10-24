/** Public help only. Never put customer records, credentials, or internal URLs here.
 * Only approved entries can be returned or sent to a provider.
 * Draft page instructions must be reviewed against the Angular UI before approval.
 */
export type HelpEntry = {
  id: string;
  approved: boolean;
  terms: readonly string[];
  question: string;
  answer: string;
};

export const SITE_HELP: readonly HelpEntry[] = [
  {
    id: 'help-scope', approved: true,
    terms: ['hello', 'hi', 'help', 'navigation', 'navigate', 'site'],
    question: 'What can the site-help assistant do?',
    answer: 'I can explain approved site instructions for account setup, navigation, holdings, orders, and transactions. I cannot view account data, provide investment advice, or execute trades. Please ask a specific how-to question. If instructions are unavailable, contact the site support team.',
  },
  {
    id: 'account-setup', approved: true,
    terms: ['signup', 'register', 'registration', 'sign up', 'signing up', 'create account', 'create an account', 'open an account', 'new account', 'account setup', 'password requirements', 'username requirements', 'password length', 'password rules', 'username rules'],
    question: 'What information is needed to create a client account?',
    answer: 'Client account registration requires an email address, a username, and a password. A username must be 3–50 characters using letters, numbers, underscores, periods, or hyphens. A password must be at least 12 characters and no more than 72 UTF-8 bytes. First and last names are optional. Enter credentials only in the registration form, never in chat. Contact the site support team if registration fails.',
  },
  {
    id: 'account-login', approved: true,
    terms: ['login', 'log in', 'logging in', 'sign in', 'signing in', 'signin', 'sign out', 'logout', 'cant access my account', 'cannot access my account', 'invalid credentials', 'unauthorized', 'already logged in', 'session expired'],
    question: 'How do account sign-in credentials work?',
    answer: 'Sign-in accepts your username or email and your original password, not a password hash. Client and employee authentication use separate login endpoints. Enter your credentials only in the site sign-in form, never in chat. Contact the site support team if you cannot sign in; this assistant cannot inspect or reset accounts.',
  },
  {
    id: 'holdings-navigation', approved: true,
    terms: ['holdings', 'holding', 'portfolio', 'positions'], question: 'What are holdings and how can I find them?',
    answer: 'Holdings are assets currently held in an account; a portfolio is the collection of those assets. Look for a Holdings or Portfolio section in the site navigation, if available. Exact menu names and routes have not been verified for this site. This assistant cannot see your assets, quantities, or values. If the view is missing or appears incorrect, use the secure account interface and contact the site support team.',
  },
  {
    id: 'orders-navigation', approved: true,
    terms: ['orders', 'order', 'buy', 'sell', 'trade', 'trades'], question: 'What are orders and how do I review them?',
    answer: 'An order is an instruction to buy or sell an asset; submitting an order does not necessarily mean it has completed. Look for an Orders section, if available, to review the status in the secure site interface. Exact page names, order types, cancellation rules, and workflows have not been verified for this site. I can explain this distinction but cannot place, cancel, or execute orders, recommend trades, or verify an individual order. Contact support for account-specific order problems.',
  },
  {
    id: 'transactions-navigation', approved: true,
    terms: ['transactions', 'transaction', 'history', 'activity'], question: 'What are transactions and where can I review activity?',
    answer: 'Transactions record account activity, while orders describe instructions that may still be awaiting completion. Look for Transactions, History, or Activity in the secure site interface, if available. Exact navigation, filters, settlement times, and supported transaction types have not been verified for this site. I cannot retrieve or verify transaction records. For missing or unexpected activity, contact the site support team without pasting records into chat.',
  },
  {
    id: 'password-help', approved: true,
    terms: ['forgot password', 'forgot my password', 'forgotten password', 'reset password', 'reset my password', 'change password', 'change my password'],
    question: 'What can I do if I forgot my password?',
    answer: 'Never share your password in chat. If the sign-in screen offers a password-recovery option, use that secure flow. A recovery feature has not been verified for this site; if no option is available, contact the site support team. I cannot reset passwords, send recovery emails, or check your credentials.',
  },
  {
    id: 'browser-help', approved: true,
    terms: ['not loading', 'blank page', 'not working', 'stuck', 'loading', 'browser', 'refresh', 'error', 'errors', 'slow', 'mobile', 'phone'],
    question: 'What basic troubleshooting can I try when the site does not work?',
    answer: 'Check your internet connection and try reloading a read-only page. Use an up-to-date browser. If appropriate, try a private browser window to check whether extensions or cached state are involved. Do not repeatedly submit an order, payment, or registration because a page appears stuck; check its status first to avoid duplicate actions. Contact support with the page name, approximate time, and a sanitized error message, never passwords, tokens, or financial records.',
  },
  {
    id: 'balance-help', approved: true,
    terms: ['balance', 'balances', 'cash', 'funds', 'money'],
    question: 'Can this assistant explain account balances?',
    answer: 'A balance describes an account amount. Holdings, pending orders, and completed transactions represent different aspects of account activity and may not be interchangeable with a displayed balance. I cannot access or calculate your balance or confirm how this site calculates available funds. Use the secure account view and contact support about discrepancies. Do not paste amounts or financial records into chat.',
  },
  {
    id: 'support-help', approved: true,
    terms: ['support', 'contact', 'human', 'agent', 'assistance'],
    question: 'How can I get help from a person?',
    answer: 'Contact your site support team through the official channel provided by your organization or the site. A verified support email or URL has not been supplied to this assistant, so I cannot give a specific address. Describe the issue without sharing passwords, tokens, or financial records.',
  },
  {
    id: 'instrument-help',
    approved: true,
    terms: ['instrument', 'instruments', 'security', 'securities', 'asset', 'assets'],
    question: 'What are instruments and how can I view them?',
    answer: 'Instruments represent tradable assets such as stocks, bonds, or other financial products. Look for sections labeled Holdings, Portfolio, or similar in the secure site interface to view your instruments. I cannot access or verify your holdings. Contact support for discrepancies without sharing sensitive information.',
  }
];