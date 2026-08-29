import { BadRequestException, HttpStatus } from '@nestjs/common';
import { expectAppError } from '../common/errors/expect-app-error';
import { Types } from 'mongoose';
import { PhotosService } from '../photos/photos.service';
import { BillingService } from '../plans/billing.service';
import { TryOnService } from '../try-on/try-on.service';
import { StorageService } from '../uploads/storage.service';
import { Look } from './look.schema';
import { LooksService } from './looks.service';

type ItemRow = {
  _id: Types.ObjectId;
  name: string;
  imageUrl: string;
  typeId: { _id: Types.ObjectId; name: string; slug: string; sortOrder: number } | null;
};

const TEE_TYPE = { _id: new Types.ObjectId(), name: 'T-shirt', slug: 't-shirt', sortOrder: 10 };
const PANTS_TYPE = { _id: new Types.ObjectId(), name: 'Pants', slug: 'pants', sortOrder: 50 };
const JACKET_TYPE = { _id: new Types.ObjectId(), name: 'Jacket', slug: 'jacket', sortOrder: 80 };

function item(name: string, type: typeof TEE_TYPE): ItemRow {
  return { _id: new Types.ObjectId(), name, imageUrl: `/uploads/${name}.png`, typeId: type };
}

function build(rows: ItemRow[], composeResult: Promise<{ imageUrl: string }> = Promise.resolve({ imageUrl: '/uploads/look-1.png' })) {
  const created: Record<string, unknown>[] = [];
  const lookModel = {
    create: jest.fn(async (document: Record<string, unknown>) => {
      created.push(document);
      return { toObject: () => ({ _id: new Types.ObjectId(), ...document }) };
    }),
  } as unknown as jest.Mocked<{ create: jest.Mock }>;

  const findFilters: Record<string, unknown>[] = [];
  const itemModel = {
    find: jest.fn((filter: Record<string, unknown>) => {
      findFilters.push(filter);
      return { populate: () => ({ lean: () => ({ exec: async () => rows }) }) };
    }),
  };

  const photos = {
    findOne: jest.fn(async () => ({ _id: new Types.ObjectId(), imageUrl: '/uploads/me.png' })),
  } as unknown as PhotosService;

  const tryOn = { composeLook: jest.fn(() => composeResult) } as unknown as TryOnService;
  const storage = { releaseIfUnused: jest.fn() } as unknown as StorageService;
  const billing = {
    reserveGeneration: jest.fn(async () => ({ subscriptionId: new Types.ObjectId().toString(), periodStart: new Date() })),
    releaseGeneration: jest.fn(),
  } as unknown as BillingService;

  const service = new LooksService(
    lookModel as unknown as never,
    itemModel as unknown as never,
    photos,
    tryOn,
    storage,
    billing,
  );
  return { service, tryOn, photos, billing, created, findFilters, lookModel };
}

const photoId = new Types.ObjectId().toString();

describe('LooksService.generate', () => {
  it('scopes the wardrobe lookup to the signed-in member', async () => {
    const tee = item('tee', TEE_TYPE);
    const userId = new Types.ObjectId().toString();
    const { service, findFilters } = build([tee]);

    await service.generate(userId, { itemIds: [tee._id.toString()], photoId });

    expect(String((findFilters[0] as { userId: Types.ObjectId }).userId)).toBe(userId);
  });

  it('rejects two items of the same clothing type', async () => {
    const first = item('white-tee', TEE_TYPE);
    const second = item('black-tee', TEE_TYPE);
    const { service, tryOn } = build([first, second]);

    await expect(
      service.generate(new Types.ObjectId().toString(), {
        itemIds: [first._id.toString(), second._id.toString()],
        photoId,
      }),
    ).rejects.toThrow(/only include one T-shirt/);
    expect(tryOn.composeLook).not.toHaveBeenCalled();
  });

  it('rejects the same item selected twice', async () => {
    const tee = item('tee', TEE_TYPE);
    const { service } = build([tee]);
    const id = tee._id.toString();

    await expectAppError(
      service.generate(new Types.ObjectId().toString(), { itemIds: [id, id], photoId }),
      HttpStatus.BAD_REQUEST,
      'ITEM_DUPLICATE',
    );
  });

  it('rejects a look referencing an item the member does not own', async () => {
    const mine = item('tee', TEE_TYPE);
    const { service } = build([mine]);

    await expectAppError(
      service.generate(new Types.ObjectId().toString(), {
        itemIds: [mine._id.toString(), new Types.ObjectId().toString()],
        photoId,
      }),
      HttpStatus.NOT_FOUND,
      'ITEM_NOT_YOURS',
    );
  });

  it('accepts one item per type and layers them in clothing-type order', async () => {
    const jacket = item('jacket', JACKET_TYPE);
    const tee = item('tee', TEE_TYPE);
    const pants = item('pants', PANTS_TYPE);
    const { service, tryOn, created } = build([jacket, tee, pants]);

    const look = await service.generate(new Types.ObjectId().toString(), {
      itemIds: [jacket._id.toString(), tee._id.toString(), pants._id.toString()],
      photoId,
    });

    expect((tryOn.composeLook as jest.Mock).mock.calls[0][0].garments.map((g: { label: string }) => g.label)).toEqual([
      'T-shirt',
      'Pants',
      'Jacket',
    ]);
    expect(created[0].status).toBe('ready');
    expect((look as unknown as Look).resultImageUrl).toBe('/uploads/look-1.png');
  });

  it('records a failed look and rethrows when generation fails', async () => {
    const tee = item('tee', TEE_TYPE);
    const { service, created } = build([tee], Promise.reject(new BadRequestException('image service down')));

    await expect(
      service.generate(new Types.ObjectId().toString(), { itemIds: [tee._id.toString()], photoId }),
    ).rejects.toThrow('image service down');
    expect(created[0].status).toBe('failed');
    expect(created[0].errorMessage).toBe('image service down');
  });

  it('refuses a second generation while one is still running', async () => {
    const tee = item('tee', TEE_TYPE);
    let release: (value: { imageUrl: string }) => void = () => {};
    const pending = new Promise<{ imageUrl: string }>((resolve) => {
      release = resolve;
    });
    const { service } = build([tee], pending);
    const userId = new Types.ObjectId().toString();

    const first = service.generate(userId, { itemIds: [tee._id.toString()], photoId });
    await Promise.resolve();
    await expect(service.generate(userId, { itemIds: [tee._id.toString()], photoId })).rejects.toThrow(
      /already being generated/,
    );

    release({ imageUrl: '/uploads/look-1.png' });
    await first;
    await expect(service.generate(userId, { itemIds: [tee._id.toString()], photoId })).resolves.toBeDefined();
  });

  it('refuses an item whose clothing type was removed', async () => {
    const orphan: ItemRow = { ...item('tee', TEE_TYPE), typeId: null };
    const { service } = build([orphan]);

    await expect(
      service.generate(new Types.ObjectId().toString(), { itemIds: [orphan._id.toString()], photoId }),
    ).rejects.toThrow(/no clothing type/);
  });
});
