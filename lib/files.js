import { FileDoc } from './models';
export async function saveFile(ctx, { name, mime, buffer, kind }) {
  const f = await FileDoc.create({ name, mime, size: buffer.length, data: buffer, owner: ctx.user.id, kind });
  return { id: f.id, name, mime, size: buffer.length, kind, url: `/api/files/${f.id}` };
}
