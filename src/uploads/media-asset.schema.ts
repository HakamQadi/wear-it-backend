import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MediaAssetDocument = HydratedDocument<MediaAsset>;

/**
 * Where a stored filename lives on ImageKit. Deleting there needs the file id, and the
 * media search API that maps a name back to an id only catches up minutes after an upload —
 * far too late for a member who removes an item straight after adding it. Recording the id
 * the upload already returned makes the delete exact and immediate.
 */
@Schema({ timestamps: true, collection: 'mediaassets' })
export class MediaAsset {
  @Prop({ required: true, unique: true })
  filename!: string;

  @Prop({ required: true })
  fileId!: string;
}

export const MediaAssetSchema = SchemaFactory.createForClass(MediaAsset);
