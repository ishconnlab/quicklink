import { User } from './User.js';
import { School } from './School.js';
import { Holding } from './Holding.js';
import { AuditLog } from './AuditLog.js';
import { Notification } from './Notification.js';
import { Student } from './Student.js';
import { AdmissionPack } from './AdmissionPack.js';
import { AdmissionApplication } from './AdmissionApplication.js';
import { StudentRequirement } from './StudentRequirement.js';
import { GuardianInvitation, GuardianLink } from './Guardian.js';
import { AdmissionEvent, NotificationDelivery } from './AdmissionEvent.js';
import { Conversation, Message } from './Conversation.js';

const models = [
  User,
  School,
  Holding,
  AuditLog,
  Notification,
  Student,
  AdmissionPack,
  AdmissionApplication,
  StudentRequirement,
  GuardianInvitation,
  GuardianLink,
  AdmissionEvent,
  NotificationDelivery,
  Conversation,
  Message,
];

// Rebuild indexes from the current schema. This also removes indexes left over
// from older schema versions (e.g. a stale unique index that would otherwise
// reject valid writes). Best-effort: never block startup on index problems.
export async function syncAllIndexes() {
  await Promise.all(models.map((model) => model.syncIndexes()));
}

export default syncAllIndexes;
