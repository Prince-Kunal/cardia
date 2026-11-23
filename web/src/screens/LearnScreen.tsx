// Learn (PLAN.md §3): the course arrives with the Learn engine (milestone 5).

import { Empty } from '../components/ui';
import { useTitle } from '../lib/hooks';

export function LearnScreen() {
  useTitle('Learn');
  return (
    <Empty title="Learn is coming">
      <p>
        A short course from zero biology to how Cardia measures an infarct: the heart, what a heart attack is, how TTC
        staining works, and what the app's two methods do.
      </p>
    </Empty>
  );
}
