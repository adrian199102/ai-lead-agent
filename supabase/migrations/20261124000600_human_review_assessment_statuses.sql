alter table public.qualification_assessments drop constraint if exists qualification_assessments_next_action_check;
alter table public.qualification_assessments add constraint qualification_assessments_next_action_check
 check (next_action in ('ask_budget','ask_timeline','review_qualification','human_follow_up','complete'));
alter table public.qualification_assessments drop constraint if exists qualification_assessments_qualification_decision_check;
alter table public.qualification_assessments add constraint qualification_assessments_qualification_decision_check
 check (qualification_decision in ('pending','qualified','disqualified'));