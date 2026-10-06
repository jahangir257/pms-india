import mongoose from 'mongoose';
import { ROLES, PROJECT_STATUSES, TASK_STATUSES, PRIORITIES, TASK_TYPES, CLIENT_STATUSES, BILLING_TYPES, RISK_LEVELS, MODULE_STATUSES } from './constants';
const { Schema, model, models } = mongoose;
const ref = (n, extra = {}) => ({ type: Schema.Types.ObjectId, ref: n, ...extra });
const opts = { timestamps: true, toJSON: { virtuals: true, versionKey: false, transform(_d, r) { r.id = String(r._id); delete r._id; delete r.passwordHash; return r; } } };
const address = new Schema({ line1: String, line2: String, city: String, state: String, country: { type: String, default: 'India' }, pincode: String }, { _id: false });

export const User = models.User || model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: String,
  role: { type: String, enum: ROLES, default: 'employee', index: true },
  phone: String, designation: String, department: String, employeeId: String,
  active: { type: Boolean, default: true },
  lastLoginAt: Date, createdBy: ref('User'),
}, opts));

export const Client = models.Client || model('Client', new Schema({
  code: { type: String, unique: true },
  name: { type: String, required: true, trim: true, index: true },
  industry: String, contactPerson: String, designation: String,
  email: String, phone: String, altPhone: String, website: String,
  gstin: String, pan: String, cin: String,
  address: address, billingAddress: address,
  status: { type: String, enum: CLIENT_STATUSES, default: 'active' },
  accountManager: ref('User'),
  contractStart: Date, contractEnd: Date,
  paymentTerms: String, currency: { type: String, default: 'INR' },
  notes: String, tags: [String],
  archived: { type: Boolean, default: false }, createdBy: ref('User'),
}, opts));

export const Project = models.Project || model('Project', new Schema({
  code: { type: String, unique: true },
  name: { type: String, required: true, trim: true },
  client: ref('Client', { required: true, index: true }),
  description: String, category: String, poNumber: String,
  status: { type: String, enum: PROJECT_STATUSES, default: 'planning', index: true },
  priority: { type: String, enum: PRIORITIES, default: 'medium' },
  riskLevel: { type: String, enum: RISK_LEVELS, default: 'low' },
  billingType: { type: String, enum: BILLING_TYPES, default: 'fixed_price' },
  startDate: Date, endDate: Date,
  budget: { type: Number, default: 0 }, currency: { type: String, default: 'INR' },
  manager: ref('User', { index: true }),
  teamLeads: [ref('User')], employees: [ref('User')],
  tags: [String],
  archived: { type: Boolean, default: false }, createdBy: ref('User'),
}, opts));

export const Module = models.Module || model('Module', new Schema({
  project: ref('Project', { required: true, index: true }),
  name: { type: String, required: true, trim: true },
  description: String,
  status: { type: String, enum: MODULE_STATUSES, default: 'not_started' },
  lead: ref('User'), startDate: Date, endDate: Date,
  archived: { type: Boolean, default: false }, createdBy: ref('User'),
}, opts));

export const Task = models.Task || model('Task', new Schema({
  code: { type: String, unique: true },
  project: ref('Project', { required: true, index: true }),
  module: ref('Module', { index: true }),
  title: { type: String, required: true, trim: true },
  description: String,
  type: { type: String, enum: TASK_TYPES, default: 'feature' },
  status: { type: String, enum: TASK_STATUSES, default: 'todo', index: true },
  priority: { type: String, enum: PRIORITIES, default: 'medium' },
  assignee: ref('User', { index: true }), assignedBy: ref('User'),
  dueDate: Date, completedAt: Date,
  estimatedHours: { type: Number, default: 0 }, loggedHours: { type: Number, default: 0 },
  comments: [{ user: ref('User'), text: String, via: String, at: { type: Date, default: Date.now } }],
  timeLogs: [{ user: ref('User'), hours: Number, note: String, date: { type: Date, default: Date.now } }],
  createdByAI: { type: Boolean, default: false },
  archived: { type: Boolean, default: false }, createdBy: ref('User'),
}, opts));

export const Audit = models.Audit || model('Audit', new Schema({
  user: ref('User', { index: true }), action: String, entity: String, entityId: String, summary: String,
  via: { type: String, default: 'ui' },
}, opts));

export const FileDoc = models.FileDoc || model('FileDoc', new Schema({
  name: String, mime: String, size: Number, data: { type: Buffer, select: false }, owner: ref('User', { index: true }), kind: String,
}, opts));

export const ChatMessage = models.ChatMessage || model('ChatMessage', new Schema({
  user: ref('User', { required: true, index: true }),
  role: { type: String, enum: ['user', 'model'], required: true },
  text: { type: String, default: '' },
  files: { type: [Schema.Types.Mixed], default: [] },
  actions: { type: [Schema.Types.Mixed], default: [] },
}, opts));

const Counter = models.Counter || model('Counter', new Schema({ _id: String, seq: { type: Number, default: 0 } }));
export async function nextSeq(name) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return c.seq;
}
