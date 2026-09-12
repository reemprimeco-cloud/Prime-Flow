-- Lets a non-admin employee (e.g. a graphic designer) send the customer a
-- design-approval link before production starts — a capability that used to
-- be admin-only (see requestDesignApproval in lib/actions/design-approval.ts).
-- Off by default: existing employees keep today's behavior until an admin
-- opts one in via the employee edit form.
alter table employees
  add column can_request_design_approval boolean not null default false;
