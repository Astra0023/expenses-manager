import { bytesToHex } from '@noble/hashes/utils';
import { DEFAULT_CATEGORY_NAMES, type Category, type CategoryStatus, type KeyValueStorage, type RandomBytes } from './types';

export function createCategoryService(storage: KeyValueStorage, randomBytes: RandomBytes, userId: string) {
  const key = `me:categories:${userId}`;

  async function load(): Promise<Category[]> {
    const raw = await storage.getItem(key);
    if (raw) return JSON.parse(raw) as Category[];
    // Default ids equal their names so expenses saved before categories were editable still resolve.
    const seeded: Category[] = DEFAULT_CATEGORY_NAMES.map((name) => ({ id: name, name, status: 'active' }));
    await storage.setItem(key, JSON.stringify(seeded));
    return seeded;
  }
  const save = (list: Category[]) => storage.setItem(key, JSON.stringify(list));

  function assertName(list: Category[], name: string, exceptId?: string): string {
    const clean = name.trim();
    if (!clean) throw new Error('Category name is required');
    if (list.some((c) => c.id !== exceptId && c.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('Category already exists');
    }
    return clean;
  }

  async function mutate(id: string, patch: Partial<Category>, check?: (list: Category[]) => void): Promise<void> {
    const list = await load();
    const index = list.findIndex((c) => c.id === id);
    if (index < 0) throw new Error('Category not found');
    check?.(list);
    list[index] = { ...list[index], ...patch };
    await save(list);
  }

  return {
    list: load,
    async add(name: string): Promise<Category> {
      const list = await load();
      const category: Category = { id: bytesToHex(randomBytes(8)), name: assertName(list, name), status: 'active' };
      await save([...list, category]);
      return category;
    },
    update: (id: string, name: string) =>
      mutate(id, {}, (list) => {
        const clean = assertName(list, name, id);
        list.find((c) => c.id === id)!.name = clean;
      }),
    /** "Delete" is a soft delete: the category becomes inactive and history keeps its name. */
    setStatus: (id: string, status: CategoryStatus) => mutate(id, { status }),
  };
}

export type CategoryService = ReturnType<typeof createCategoryService>;
