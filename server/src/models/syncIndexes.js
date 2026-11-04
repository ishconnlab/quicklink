import { User } from './User.js';
import { LearningBook } from './LearningBook.js';
import { LearningProgress } from './LearningProgress.js';
import { LearningClass } from './LearningClass.js';
import { LiveSession } from './LiveSession.js';
import { ClassChatMessage } from './ClassChatMessage.js';
import { ClassSessionNote } from './ClassSessionNote.js';
import { ClassInvitation } from './ClassInvitation.js';
import { Assignment } from './Assignment.js';
import { AssignmentSubmission } from './AssignmentSubmission.js';
import { Notification } from './Notification.js';
import { CourseCertificate } from './CourseCertificate.js';
import { TrainingRegistrationForm } from './TrainingRegistrationForm.js';
import { TrainingRegistration } from './TrainingRegistration.js';
import { LearningAssessmentAttempt } from './LearningAssessmentAttempt.js';
import { CertificationAssessmentAttempt } from './CertificationAssessmentAttempt.js';

export async function syncAllIndexes() {
  await Promise.all([
    User.syncIndexes(),
    LearningBook.syncIndexes(),
    LearningProgress.syncIndexes(),
    LearningClass.syncIndexes(),
    LiveSession.syncIndexes(),
    ClassChatMessage.syncIndexes(),
    ClassSessionNote.syncIndexes(),
    ClassInvitation.syncIndexes(),
    Assignment.syncIndexes(),
    AssignmentSubmission.syncIndexes(),
    Notification.syncIndexes(),
    CourseCertificate.syncIndexes(),
    TrainingRegistrationForm.syncIndexes(),
    TrainingRegistration.syncIndexes(),
    LearningAssessmentAttempt.syncIndexes(),
    CertificationAssessmentAttempt.syncIndexes(),
  ]);
}

export default syncAllIndexes;
