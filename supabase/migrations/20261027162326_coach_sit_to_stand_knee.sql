-- Sit-to-stand at chair height is a standard exercise for knee pain: allow it for knee
-- conditions too, so the "Gentle start (55+)" plan can be used with sore knees.
update public.exercises
set safety_tags = array['senior_safe', 'knee_friendly', 'back_friendly', 'low_impact']
where trainer_id is null and name = 'Sit-to-stand (chair squat)';
