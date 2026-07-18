-- RC2: Employee Management. New audit_action values for the employee
-- administration module. employee_password_reset is intentionally its own
-- action (never carries password/hash material in old_value/new_value) so
-- it's distinguishable in the audit trail from a routine profile edit.

alter type audit_action add value 'employee_created';
alter type audit_action add value 'employee_updated';
alter type audit_action add value 'employee_password_reset';
