const MAX_LESSON_CONTENT = 30000;
const MAX_CODE_BLOCKS = 20;
const MAX_CODE_LENGTH = 20000;

const labelFor = (value) => String(value)
  .replace(/_/g, ' ')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/\s+/g, ' ')
  .replace(/^./, (character) => character.toUpperCase());

function renderCurriculumContent(value, label, path, codeBlocks, depth = 2) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    if (label.toLowerCase() === 'code' && value.trim()) {
      const number = codeBlocks.length + 1;
      codeBlocks.push({ language: 'python', source: value, explanation: path.join(' · ').slice(0, 2000) });
      return `Code example ${number} (${path.join(' · ')}) is shown in the code examples below.`;
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return 'None specified.';
    return value.map((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const heading = item.title || item.name || item.prompt || `${labelFor(label)} ${index + 1}`;
        const body = renderCurriculumContent(item, '', [...path, String(heading)], codeBlocks, depth + 1);
        return `${'#'.repeat(Math.min(depth + 1, 5))} ${heading}\n\n${body}`;
      }
      const rendered = renderCurriculumContent(item, label, path, codeBlocks, depth + 1);
      return rendered.split('\n').map((line) => `- ${line}`).join('\n');
    }).join('\n\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value).map(([key, child]) => {
      const heading = labelFor(key);
      const childPath = [...path, heading];
      const rendered = renderCurriculumContent(child, key, childPath, codeBlocks, depth + 1);
      if (!rendered) return '';
      if (key.toLowerCase() === 'code' && typeof child === 'string') {
        return `**${rendered.split(' is shown')[0]} is shown in the code examples below.**`;
      }
      return `${'#'.repeat(Math.min(depth + 1, 5))} ${heading}\n\n${rendered}`;
    }).filter(Boolean).join('\n\n');
  }
  return '';
}

function collectResources(value) {
  const resources = [];
  const addResource = (title, rawUrl) => {
    const url = String(rawUrl || '').replace(/[),.;!?]+$/, '');
    if (!/^https?:\/\//i.test(url)) return;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) return;
    resources.push({ title: String(title || url).slice(0, 180), url: url.slice(0, 2000) });
  };
  const visit = (item, label = '') => {
    if (typeof item === 'string') {
      const urlPattern = /https?:\/\/[^\s<>"']+/gi;
      for (const match of item.matchAll(urlPattern)) {
        const title = item.slice(0, match.index).replace(/[\s:–—-]+$/, '').trim();
        addResource(title || label, match[0]);
      }
      return;
    }
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      item.forEach((entry) => visit(entry, label));
      return;
    }
    if (typeof item.url === 'string') addResource(item.title || item.name || label, item.url);
    Object.entries(item).forEach(([key, child]) => {
      if (key !== 'url') visit(child, labelFor(key));
    });
  };
  visit(value);
  return resources.filter((resource, index) => resources.findIndex((entry) => entry.url === resource.url) === index).slice(0, 30);
}

function formatCourseOverview(course, codeBlocks) {
  const overview = Object.fromEntries(Object.entries(course).filter(([key]) => key !== 'days'));
  return renderCurriculumContent(overview, 'Course overview', ['Course overview'], codeBlocks);
}

export function parseCourseCurriculum(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  const course = root?.course;
  if (!course || typeof course !== 'object' || Array.isArray(course)) {
    throw new Error('The JSON must contain a course object.');
  }
  if (!Array.isArray(course.days) || course.days.length < 10 || course.days.length > 100) {
    throw new Error('The curriculum must contain between 10 and 100 learning days.');
  }
  if (!course.title || typeof course.title !== 'string' || course.title.length > 160) {
    throw new Error('The course title must be between 1 and 160 characters.');
  }
  const days = [...course.days].sort((first, second) => Number(first?.day) - Number(second?.day));
  const seenDays = new Set();
  const modules = [{ title: `${course.days.length}-Day Curriculum`, lessons: [] }];
  const overviewCodeBlocks = [];
  const overview = formatCourseOverview(course, overviewCodeBlocks);

  days.forEach((day, index) => {
    if (!day || typeof day !== 'object' || Array.isArray(day) || !Number.isInteger(day.day) || !day.title || typeof day.title !== 'string') {
      throw new Error(`Learning day ${index + 1} must include a numeric day and a title.`);
    }
    if (seenDays.has(day.day)) throw new Error(`Learning day ${day.day} is listed more than once.`);
    seenDays.add(day.day);
    if (day.day !== index + 1) throw new Error(`Learning days must be numbered consecutively from Day 1; Day ${index + 1} is missing.`);
    const codeBlocks = [];
    let content = renderCurriculumContent(day, `Day ${day.day}`, [`Day ${day.day}`], codeBlocks);
    if (index === 0 && overview) content = `${overview}\n\n${content}`;
    if (content.length > MAX_LESSON_CONTENT) throw new Error(`Day ${day.day} content exceeds the ${MAX_LESSON_CONTENT.toLocaleString()} character limit.`);
    if (codeBlocks.length > MAX_CODE_BLOCKS) throw new Error(`Day ${day.day} has more than ${MAX_CODE_BLOCKS} code examples.`);
    const longCode = codeBlocks.find((block) => block.source.length > MAX_CODE_LENGTH);
    if (longCode) throw new Error(`A code example in Day ${day.day} exceeds the ${MAX_CODE_LENGTH.toLocaleString()} character limit.`);
    modules[0].lessons.push({
      title: `Day ${day.day} — ${day.title}`.slice(0, 180),
      content,
      videoUrl: '',
      imageUrl: '',
      imagePublicId: '',
      resources: collectResources(index === 0 ? [course.global_resources, day.resources] : day.resources),
      code: { language: '', source: '' },
      codeBlocks,
      knowledgeCheck: [],
      passMark: 70,
      assessmentAttempts: 3,
      availableAt: null,
    });
  });
  if (overviewCodeBlocks.length) throw new Error('Course overview contains unsupported top-level code examples; add them to a learning day.');
  return {
    course: {
      title: course.title,
      subject: 'Machine Learning',
      course: 'Machine Learning',
      difficulty: 'Beginner',
      courseDuration: `${course.days.length} days${course.estimated_hours_per_day ? ` · ${course.estimated_hours_per_day} hours per day` : ''}`,
      language: course.language || 'English',
      introduction: String(course.subtitle || '').slice(0, 500),
      description: `${course.level || 'Beginner'} · ${course.target_audience || ''}`.slice(0, 12000),
      prerequisites: Array.isArray(course.prerequisites) ? course.prerequisites.slice(0, 30).map(String) : [],
      learningObjectives: Array.isArray(course.learning_outcomes) ? course.learning_outcomes.slice(0, 30).map(String) : [],
      modules,
      lessonAccessMode: 'sequential',
    },
    days: modules[0].lessons.map(({ title, content, codeBlocks }) => ({
      title,
      contentCharacters: content.length,
      codeExamples: codeBlocks.length,
    })),
    raw: root,
  };
}
