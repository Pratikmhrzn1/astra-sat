-- SAT Reading & Writing test question set
-- Run this in the Render PostgreSQL console (Dashboard → your DB → "PSQL Console" or "Query" tab)

DO $$
DECLARE
  v_set_id UUID;
  v_p1_id  UUID;
  v_p2_id  UUID;
  v_p5_id  UUID;
BEGIN

  -- Question set
  INSERT INTO question_sets (title, subject, description)
  VALUES (
    'SAT Reading & Writing — Fundamentals',
    'english',
    'Five questions spanning inference, vocabulary, grammar, transitions, and command of evidence. Module 1 difficulty.'
  )
  RETURNING id INTO v_set_id;

  -- ── Passage 1: Bioluminescence (inference) ───────────────────────────────
  INSERT INTO passages (set_id, title, passage_text, order_index)
  VALUES (
    v_set_id,
    'Bioluminescence in Deep-Sea Organisms',
    'In the perpetual darkness of the deep ocean, many organisms have evolved the ability to produce their own light through a chemical process called bioluminescence. This phenomenon occurs when a light-emitting molecule called luciferin reacts with oxygen in the presence of an enzyme, luciferase, releasing energy as visible light. Unlike sunlight, this cold light generates almost no heat, making it energetically efficient. Scientists estimate that over 75 percent of deep-sea creatures are capable of bioluminescence, yet researchers have studied only a fraction of these species. The light serves diverse purposes: some fish lure prey with glowing appendages, others use flashes to startle predators, and certain species coordinate mating displays through synchronized pulses. One recent study found that anglerfish use a bacterium that produces bioluminescence in exchange for shelter and nutrients, a relationship that benefits both organisms.',
    1
  )
  RETURNING id INTO v_p1_id;

  INSERT INTO questions (set_id, passage_id, question_type, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, sub_skill, sub_skill_source, order_index)
  VALUES (
    v_set_id, v_p1_id, 'multiple_choice',
    'Which choice best describes the main purpose of the passage?',
    'To argue that bioluminescence is the most important survival adaptation in the deep ocean',
    'To explain why deep-sea research is underfunded compared to other scientific fields',
    'To describe the chemical mechanism of bioluminescence and the variety of functions it serves',
    'To compare the mating behaviors of anglerfish with those of other deep-sea species',
    'c',
    'The passage opens with the chemistry of bioluminescence and then surveys multiple functions — luring prey, startling predators, mating, symbiosis — making C the accurate summary. A overstates one function; B is never mentioned; D narrows the scope to just one species.',
    'inference', 'human_confirmed', 1
  );

  -- ── Passage 2: Urban Heat Islands (vocab_in_context) ─────────────────────
  INSERT INTO passages (set_id, title, passage_text, order_index)
  VALUES (
    v_set_id,
    'Urban Heat Islands',
    'Cities are measurably warmer than surrounding rural areas, a phenomenon researchers call the urban heat island effect. Dark surfaces such as asphalt and rooftops absorb more solar radiation than vegetation does, and the dense concentration of buildings traps heat that would otherwise dissipate into the atmosphere. The effect is most pronounced on calm, clear nights when rural areas cool rapidly through radiative loss but urban cores retain the day''s warmth. Engineers and urban planners have proposed several mitigation strategies: installing reflective "cool roofs," expanding tree canopy coverage, and replacing impervious pavement with permeable surfaces that allow water to infiltrate the ground and cool through evaporation.',
    2
  )
  RETURNING id INTO v_p2_id;

  INSERT INTO questions (set_id, passage_id, question_type, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, sub_skill, sub_skill_source, order_index)
  VALUES (
    v_set_id, v_p2_id, 'multiple_choice',
    'As used in the passage, "dissipate" most nearly means',
    'concentrate',
    'disperse',
    'accelerate',
    'retain',
    'b',
    '"Dissipate" describes heat spreading outward and disappearing into the atmosphere — B, "disperse," captures this sense. A and D are antonyms of the intended meaning; C is unrelated to the passage''s description of heat transfer.',
    'vocab_in_context', 'human_confirmed', 2
  );

  -- ── No passage: Grammar ───────────────────────────────────────────────────
  INSERT INTO questions (set_id, passage_id, question_type, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, sub_skill, sub_skill_source, order_index)
  VALUES (
    v_set_id, NULL, 'multiple_choice',
    E'The city council, along with several local business groups, _______ planning a new transit corridor that would connect the downtown core to the outer suburbs.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?',
    'is',
    'are',
    'were',
    'have been',
    'a',
    'The subject is "The city council" (singular); "along with several local business groups" is a parenthetical phrase and does not change the subject. Singular subjects take singular verbs — "is." B and D use plural agreement; C shifts tense to past without justification.',
    'grammar', 'human_confirmed', 3
  );

  -- ── No passage: Transitions ───────────────────────────────────────────────
  INSERT INTO questions (set_id, passage_id, question_type, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, sub_skill, sub_skill_source, order_index)
  VALUES (
    v_set_id, NULL, 'multiple_choice',
    E'Early studies suggested that the drug reduced inflammation significantly. _______, a larger follow-up trial found no statistically significant difference between the treatment and placebo groups.\n\nWhich choice most logically completes the text?',
    'Similarly,',
    'Therefore,',
    'In addition,',
    'However,',
    'd',
    'The second sentence contradicts the first (no effect vs. significant effect), requiring a contrast transition. D, "However," signals this contrast correctly. A signals similarity; B signals a logical consequence; C signals addition — none fit a contradiction.',
    'transitions', 'human_confirmed', 4
  );

  -- ── Passage 5: Placebo Effect (command_of_evidence) ──────────────────────
  INSERT INTO passages (set_id, title, passage_text, order_index)
  VALUES (
    v_set_id,
    'The Placebo Effect',
    'The placebo effect — improvement in a patient''s condition resulting from a treatment with no active therapeutic ingredient — has long been considered a nuisance in clinical research, a confounding variable to be controlled away. Recent thinking challenges this view. Neuroscientist Fabrizio Benedetti has shown that placebo treatments can trigger measurable physiological changes, including the release of endogenous opioids that reduce pain as effectively as low doses of morphine. His findings suggest that the brain''s expectation of improvement can itself become a mechanism of healing. Critics note, however, that placebo effects tend to be short-lived and are most pronounced in subjective outcomes like pain or nausea, where patient self-reporting plays a large role. Objective measures such as tumor size or blood cell counts rarely shift with placebo administration alone.',
    5
  )
  RETURNING id INTO v_p5_id;

  INSERT INTO questions (set_id, passage_id, question_type, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, sub_skill, sub_skill_source, order_index)
  VALUES (
    v_set_id, v_p5_id, 'multiple_choice',
    'The passage most strongly supports which claim about placebo effects?',
    'Placebo effects produce permanent physiological changes that replace the need for active medication.',
    'Placebo effects are most reliable for conditions measured through patient self-reporting rather than objective clinical markers.',
    'Benedetti''s research proved that placebos are as effective as morphine for treating all types of chronic pain.',
    'Clinical researchers now prefer to harness placebo effects rather than eliminate them from trials.',
    'b',
    'The passage states placebos are "most pronounced in subjective outcomes like pain or nausea, where patient self-reporting plays a large role," and that "objective measures… rarely shift with placebo administration." B reflects this contrast precisely. A overstates permanence; C overstates Benedetti''s finding; D is not stated in the passage.',
    'command_of_evidence', 'human_confirmed', 5
  );

  RAISE NOTICE 'Created English question set id=%', v_set_id;
END $$;
