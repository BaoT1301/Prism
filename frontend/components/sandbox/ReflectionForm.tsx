import type { ReflectionAnswer, ReflectionQuestion } from "../../features/sandbox/sandbox-types";

export function ReflectionForm({ questions, answers, onChange }: { questions: ReflectionQuestion[]; answers: ReflectionAnswer[]; onChange: (answers: ReflectionAnswer[]) => void }) {
  return <section><h3>Reflection</h3>{questions.map((question) => <label key={question.id}>{question.question}<textarea value={answers.find((answer) => answer.question_id === question.id)?.answer ?? ""} onChange={(event) => onChange([...answers.filter((answer) => answer.question_id !== question.id), { question_id: question.id, answer: event.target.value }])} /></label>)}</section>;
}
