<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Shopkeeper data is protected by row-level policies keyed on shop_id = auth.uid(); why: each shop sees only its own customers.
- Entries are immutable via a DB trigger (only notified_at/reminded_at may change); why: trust that both sides see the same timestamped record.
- Subscription extension happens only through the review_payment SQL function (admin-checked); why: users must not extend their own access.
- Public client ledger is served through the client_ledger(token) security-definer function; why: customers have no account.
- WhatsApp messages currently open via wa.me links from the shopkeeper's phone; why: no Business API connection yet.
