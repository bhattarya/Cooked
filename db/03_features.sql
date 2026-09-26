-- Typed views retain all rows; NULLIF precedes every cast.
CREATE VIEW feat.alumni AS SELECT
    NULLIF(NULLIF(campus_id, 'Not Applicable'), '')::text AS campus_id,
    NULLIF(NULLIF(major, 'Not Applicable'), '')::text AS major,
    NULLIF(NULLIF(degree_level, 'Not Applicable'), '')::text AS degree_level,
    NULLIF(NULLIF(track, 'Not Applicable'), '')::text AS track,
    NULLIF(NULLIF(graduation_term, 'Not Applicable'), '')::text AS graduation_term,
    NULLIF(NULLIF(graduation_year, 'Not Applicable'), '')::integer AS graduation_year,
    NULLIF(NULLIF(entry_type, 'Not Applicable'), '')::text AS entry_type,
    NULLIF(NULLIF(time_to_degree_years, 'Not Applicable'), '')::numeric AS time_to_degree_years,
    NULLIF(NULLIF(total_credits_earned, 'Not Applicable'), '')::integer AS total_credits_earned,
    NULLIF(NULLIF(final_gpa, 'Not Applicable'), '')::numeric AS final_gpa,
    NULLIF(NULLIF(major_gpa, 'Not Applicable'), '')::numeric AS major_gpa,
    NULLIF(NULLIF(residency, 'Not Applicable'), '')::text AS residency,
    NULLIF(NULLIF(holds_prior_umbc_bachelors, 'Not Applicable'), '')::boolean AS holds_prior_umbc_bachelors,
    NULLIF(NULLIF(work_hours_per_week_while_enrolled, 'Not Applicable'), '')::integer AS work_hours_per_week_while_enrolled,
    NULLIF(NULLIF(internship_count, 'Not Applicable'), '')::integer AS internship_count,
    NULLIF(NULLIF(credential_count, 'Not Applicable'), '')::integer AS credential_count,
    NULLIF(NULLIF(engagement_activity_count, 'Not Applicable'), '')::integer AS engagement_activity_count,
    NULLIF(NULLIF(net_cost_usd, 'Not Applicable'), '')::integer AS net_cost_usd,
    NULLIF(NULLIF(total_loans_usd, 'Not Applicable'), '')::integer AS total_loans_usd,
    NULLIF(NULLIF(first_destination, 'Not Applicable'), '')::text AS first_destination,
    NULLIF(NULLIF(months_to_first_job, 'Not Applicable'), '')::numeric AS months_to_first_job,
    NULLIF(NULLIF(first_job_title, 'Not Applicable'), '')::text AS first_job_title,
    NULLIF(NULLIF(first_job_family, 'Not Applicable'), '')::text AS first_job_family,
    NULLIF(NULLIF(first_employer, 'Not Applicable'), '')::text AS first_employer,
    NULLIF(NULLIF(first_employer_industry, 'Not Applicable'), '')::text AS first_employer_industry,
    NULLIF(NULLIF(first_job_region, 'Not Applicable'), '')::text AS first_job_region,
    NULLIF(NULLIF(first_job_annual_salary_usd, 'Not Applicable'), '')::integer AS first_job_annual_salary_usd,
    NULLIF(NULLIF(first_job_is_remote, 'Not Applicable'), '')::boolean AS first_job_is_remote,
    NULLIF(NULLIF(first_job_found_via, 'Not Applicable'), '')::text AS first_job_found_via
FROM raw.alumni;

CREATE VIEW feat.students_current AS SELECT
    NULLIF(NULLIF(campus_id, 'Not Applicable'), '')::text AS campus_id,
    NULLIF(NULLIF(entry_term, 'Not Applicable'), '')::text AS entry_term,
    NULLIF(NULLIF(entry_type, 'Not Applicable'), '')::text AS entry_type,
    NULLIF(NULLIF(major, 'Not Applicable'), '')::text AS major,
    NULLIF(NULLIF(track, 'Not Applicable'), '')::text AS track,
    NULLIF(NULLIF(second_major, 'Not Applicable'), '')::text AS second_major,
    NULLIF(NULLIF(minor, 'Not Applicable'), '')::text AS minor,
    NULLIF(NULLIF(class_level, 'Not Applicable'), '')::text AS class_level,
    NULLIF(NULLIF(residency, 'Not Applicable'), '')::text AS residency,
    NULLIF(NULLIF(enrollment_intensity, 'Not Applicable'), '')::text AS enrollment_intensity,
    NULLIF(NULLIF(is_first_generation, 'Not Applicable'), '')::boolean AS is_first_generation,
    NULLIF(NULLIF(work_hours_per_week, 'Not Applicable'), '')::integer AS work_hours_per_week,
    NULLIF(NULLIF(credits_earned, 'Not Applicable'), '')::integer AS credits_earned,
    NULLIF(NULLIF(credits_required, 'Not Applicable'), '')::integer AS credits_required,
    NULLIF(NULLIF(cumulative_gpa, 'Not Applicable'), '')::numeric AS cumulative_gpa,
    NULLIF(NULLIF(major_gpa, 'Not Applicable'), '')::numeric AS major_gpa,
    NULLIF(NULLIF(academic_standing, 'Not Applicable'), '')::text AS academic_standing,
    NULLIF(NULLIF(expected_graduation_term, 'Not Applicable'), '')::text AS expected_graduation_term,
    NULLIF(NULLIF(internship_count, 'Not Applicable'), '')::integer AS internship_count,
    NULLIF(NULLIF(credential_count, 'Not Applicable'), '')::integer AS credential_count,
    NULLIF(NULLIF(engagement_activity_count, 'Not Applicable'), '')::integer AS engagement_activity_count,
    NULLIF(NULLIF(tuition_paid_to_date_usd, 'Not Applicable'), '')::integer AS tuition_paid_to_date_usd
FROM raw.students_current;

CREATE VIEW feat.transcripts AS SELECT
    NULLIF(NULLIF(campus_id, 'Not Applicable'), '')::text AS campus_id,
    NULLIF(NULLIF(term, 'Not Applicable'), '')::text AS term,
    NULLIF(NULLIF(course_id, 'Not Applicable'), '')::text AS course_id,
    NULLIF(NULLIF(course_title, 'Not Applicable'), '')::text AS course_title,
    NULLIF(NULLIF(subject, 'Not Applicable'), '')::text AS subject,
    NULLIF(NULLIF(credits_attempted, 'Not Applicable'), '')::integer AS credits_attempted,
    NULLIF(NULLIF(credits_earned, 'Not Applicable'), '')::integer AS credits_earned,
    NULLIF(NULLIF(grade, 'Not Applicable'), '')::text AS grade,
    NULLIF(NULLIF(grade_points, 'Not Applicable'), '')::numeric AS grade_points,
    NULLIF(NULLIF(is_repeat, 'Not Applicable'), '')::boolean AS is_repeat,
    NULLIF(NULLIF(requirement_category, 'Not Applicable'), '')::text AS requirement_category
FROM raw.transcripts;

CREATE VIEW feat.employment_history AS SELECT
    NULLIF(NULLIF(job_id, 'Not Applicable'), '')::text AS job_id,
    NULLIF(NULLIF(campus_id, 'Not Applicable'), '')::text AS campus_id,
    NULLIF(NULLIF(employer, 'Not Applicable'), '')::text AS employer,
    NULLIF(NULLIF(employer_industry, 'Not Applicable'), '')::text AS employer_industry,
    NULLIF(NULLIF(employer_size, 'Not Applicable'), '')::text AS employer_size,
    NULLIF(NULLIF(job_title, 'Not Applicable'), '')::text AS job_title,
    NULLIF(NULLIF(job_family, 'Not Applicable'), '')::text AS job_family,
    NULLIF(NULLIF(seniority_level, 'Not Applicable'), '')::text AS seniority_level,
    NULLIF(NULLIF(region, 'Not Applicable'), '')::text AS region,
    NULLIF(NULLIF(cost_of_living_index, 'Not Applicable'), '')::integer AS cost_of_living_index,
    NULLIF(NULLIF(is_remote, 'Not Applicable'), '')::boolean AS is_remote,
    NULLIF(NULLIF(start_date, 'Not Applicable'), '')::date AS start_date,
    NULLIF(NULLIF(end_date, 'Not Applicable'), '')::date AS end_date,
    NULLIF(NULLIF(is_current, 'Not Applicable'), '')::boolean AS is_current,
    NULLIF(NULLIF(tenure_months, 'Not Applicable'), '')::integer AS tenure_months,
    NULLIF(NULLIF(annual_salary_usd, 'Not Applicable'), '')::integer AS annual_salary_usd,
    NULLIF(NULLIF(change_type, 'Not Applicable'), '')::text AS change_type,
    NULLIF(NULLIF(requires_clearance, 'Not Applicable'), '')::boolean AS requires_clearance,
    NULLIF(NULLIF(role_skill_tags, 'Not Applicable'), '')::text AS role_skill_tags
FROM raw.employment_history;

CREATE VIEW feat.student_experience AS SELECT
    NULLIF(NULLIF(record_id, 'Not Applicable'), '')::text AS record_id,
    NULLIF(NULLIF(campus_id, 'Not Applicable'), '')::text AS campus_id,
    NULLIF(NULLIF(experience_type, 'Not Applicable'), '')::text AS experience_type,
    NULLIF(NULLIF(experience_name, 'Not Applicable'), '')::text AS experience_name,
    NULLIF(NULLIF(organization, 'Not Applicable'), '')::text AS organization,
    NULLIF(NULLIF(industry, 'Not Applicable'), '')::text AS industry,
    NULLIF(NULLIF(term, 'Not Applicable'), '')::text AS term,
    NULLIF(NULLIF(duration_terms, 'Not Applicable'), '')::integer AS duration_terms,
    NULLIF(NULLIF(hours_per_week, 'Not Applicable'), '')::integer AS hours_per_week,
    NULLIF(NULLIF(is_paid, 'Not Applicable'), '')::boolean AS is_paid,
    NULLIF(NULLIF(role_level, 'Not Applicable'), '')::text AS role_level,
    NULLIF(NULLIF(outcome, 'Not Applicable'), '')::text AS outcome
FROM raw.student_experience;

CREATE VIEW feat.course_catalog AS SELECT
    NULLIF(NULLIF(course_id, 'Not Applicable'), '')::text AS course_id,
    NULLIF(NULLIF(subject, 'Not Applicable'), '')::text AS subject,
    NULLIF(NULLIF(catalog_number, 'Not Applicable'), '')::text AS catalog_number,
    NULLIF(NULLIF(course_title, 'Not Applicable'), '')::text AS course_title,
    NULLIF(NULLIF(credits, 'Not Applicable'), '')::integer AS credits,
    NULLIF(NULLIF(course_level, 'Not Applicable'), '')::text AS course_level,
    NULLIF(NULLIF(course_type, 'Not Applicable'), '')::text AS course_type,
    NULLIF(NULLIF(required_for_majors, 'Not Applicable'), '')::text AS required_for_majors,
    NULLIF(NULLIF(prerequisite_ids, 'Not Applicable'), '')::text AS prerequisite_ids,
    NULLIF(NULLIF(skill_tags, 'Not Applicable'), '')::text AS skill_tags,
    NULLIF(NULLIF(difficulty_index, 'Not Applicable'), '')::numeric AS difficulty_index,
    NULLIF(NULLIF(typical_terms_offered, 'Not Applicable'), '')::text AS typical_terms_offered
FROM raw.course_catalog;

CREATE TABLE feat.person_term (
  campus_id text NOT NULL,
  term_start date NOT NULL,
  term_idx integer NOT NULL,
  k integer NOT NULL CHECK (k > 0),
  credits_attempted integer NOT NULL,
  credits_earned integer NOT NULL,
  w_count integer NOT NULL DEFAULT 0,
  f_count integer NOT NULL DEFAULT 0,
  repeat_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (campus_id, term_start),
  CHECK (to_char(term_start, 'MM-DD') IN ('01-15', '08-25'))
);
CREATE TABLE feat.person_static (
  campus_id text PRIMARY KEY,
  population text NOT NULL CHECK (population IN ('alumni', 'current')),
  major text, track text, entry_type text, residency text,
  work_hours integer, graduation_year integer, time_to_degree_years numeric(4,1),
  cooked boolean, mode text,
  CHECK (population = 'alumni' OR (cooked IS NULL AND mode IS NULL))
);

-- Invoked only by the loader/migration owner; no model or cluster implementation.
CREATE FUNCTION feat.refresh_features() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  TRUNCATE feat.person_term, feat.person_static;
  INSERT INTO feat.person_term
  WITH completed AS (
    SELECT campus_id,
      split_part(term, ' ', 2)::integer AS year,
      split_part(term, ' ', 1) = 'Fall' AS fall,
      credits_attempted, credits_earned, grade, is_repeat
    FROM feat.transcripts
    WHERE term ~ '^(Fall|Spring) [0-9]{4}$' AND grade <> 'IP'
  ), terms AS (
    SELECT campus_id,
      make_date(year, CASE WHEN fall THEN 8 ELSE 1 END,
                      CASE WHEN fall THEN 25 ELSE 15 END) AS term_start,
      2 * year + fall::integer AS term_idx,
      sum(credits_attempted)::integer AS attempted,
      sum(credits_earned)::integer AS earned,
      count(*) FILTER (WHERE grade = 'W')::integer AS w,
      count(*) FILTER (WHERE grade = 'F')::integer AS f,
      count(*) FILTER (WHERE is_repeat)::integer AS repeats
    FROM completed GROUP BY campus_id, year, fall
  )
  SELECT campus_id, term_start, term_idx,
    row_number() OVER (PARTITION BY campus_id ORDER BY term_start)::integer,
    attempted, earned, w, f, repeats FROM terms;

  INSERT INTO feat.person_static
    (campus_id, population, major, track, entry_type, residency, work_hours,
     graduation_year, time_to_degree_years, cooked)
  SELECT a.campus_id, 'alumni', major, track, entry_type, residency,
    work_hours_per_week_while_enrolled, graduation_year, time_to_degree_years,
    time_to_degree_years > 5 OR coalesce(w.n, 0) >= 5
  FROM feat.alumni a LEFT JOIN (
    -- The §7.3 label uses TOTAL withdrawals, including Summer; behaviour excludes Summer.
    SELECT campus_id, count(*) AS n FROM feat.transcripts
    WHERE grade = 'W' GROUP BY campus_id
  ) w USING (campus_id);

  INSERT INTO feat.person_static
    (campus_id, population, major, track, entry_type, residency, work_hours)
  SELECT campus_id, 'current', major, track, entry_type, residency, work_hours_per_week
  FROM feat.students_current;
END $$;
