-- Immutable source columns: every CSV field is TEXT.
CREATE TABLE raw.alumni (
    campus_id text,
    major text,
    degree_level text,
    track text,
    graduation_term text,
    graduation_year text,
    entry_type text,
    time_to_degree_years text,
    total_credits_earned text,
    final_gpa text,
    major_gpa text,
    residency text,
    holds_prior_umbc_bachelors text,
    work_hours_per_week_while_enrolled text,
    internship_count text,
    credential_count text,
    engagement_activity_count text,
    net_cost_usd text,
    total_loans_usd text,
    first_destination text,
    months_to_first_job text,
    first_job_title text,
    first_job_family text,
    first_employer text,
    first_employer_industry text,
    first_job_region text,
    first_job_annual_salary_usd text,
    first_job_is_remote text,
    first_job_found_via text
);

CREATE TABLE raw.students_current (
    campus_id text,
    entry_term text,
    entry_type text,
    major text,
    track text,
    second_major text,
    minor text,
    class_level text,
    residency text,
    enrollment_intensity text,
    is_first_generation text,
    work_hours_per_week text,
    credits_earned text,
    credits_required text,
    cumulative_gpa text,
    major_gpa text,
    academic_standing text,
    expected_graduation_term text,
    internship_count text,
    credential_count text,
    engagement_activity_count text,
    tuition_paid_to_date_usd text
);

CREATE TABLE raw.transcripts (
    campus_id text,
    term text,
    course_id text,
    course_title text,
    subject text,
    credits_attempted text,
    credits_earned text,
    grade text,
    grade_points text,
    is_repeat text,
    requirement_category text
);

CREATE TABLE raw.employment_history (
    job_id text,
    campus_id text,
    employer text,
    employer_industry text,
    employer_size text,
    job_title text,
    job_family text,
    seniority_level text,
    region text,
    cost_of_living_index text,
    is_remote text,
    start_date text,
    end_date text,
    is_current text,
    tenure_months text,
    annual_salary_usd text,
    change_type text,
    requires_clearance text,
    role_skill_tags text
);

CREATE TABLE raw.student_experience (
    record_id text,
    campus_id text,
    experience_type text,
    experience_name text,
    organization text,
    industry text,
    term text,
    duration_terms text,
    hours_per_week text,
    is_paid text,
    role_level text,
    outcome text
);

CREATE TABLE raw.course_catalog (
    course_id text,
    subject text,
    catalog_number text,
    course_title text,
    credits text,
    course_level text,
    course_type text,
    required_for_majors text,
    prerequisite_ids text,
    skill_tags text,
    difficulty_index text,
    typical_terms_offered text
);
