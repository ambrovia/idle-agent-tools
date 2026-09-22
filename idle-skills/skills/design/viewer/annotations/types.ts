export interface AnnotationAnchor {
  path: number[];
  component: string;
  element: string;
}

export interface AnnotationTarget {
  component: string;
  dsComponent: string | null;
  element: string;
  anchor?: AnnotationAnchor;
}

export interface Annotation {
  id: string;
  createdAt: string;
  story: string;
  variant: string;
  note: string;
  target: AnnotationTarget;
}

export interface Round {
  round: number;
  startedAt: string;
  annotations: Annotation[];
}

export interface AnnotationState {
  currentRound: number;
  rounds: Round[];
}

export interface AnnotationInput {
  story: string;
  variant: string;
  note: string;
  target: AnnotationTarget;
}
