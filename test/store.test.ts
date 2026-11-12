import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { makeBackup, restoreBackup, BackupError } from "../src/core/backup";
import { addWordAt, newProfile, saveMessage } from "../src/core/profile";
import { IndexedDbStore, MemoryStore, type AppStore } from "../src/core/store";
import { builtInPlaces } from "../src/features/communicator/boards";

async function stores(): Promise<[string, AppStore][]> {
  return [
    ["IndexedDB", await IndexedDbStore.open()],
    ["memory", new MemoryStore()],
  ];
}

describe("on-device store", () => {
  it("keeps profiles, photos and settings, and deletes a student's photos with them", async () => {
    for (const [name, store] of await stores()) {
      const a = newProfile(`A ${name}`);
      const b = newProfile(`B ${name}`);
      await store.saveProfile(a);
      await store.saveProfile(b);
      await store.putMedia(`ph-a-${name}`, a.id, new Blob(["a"], { type: "image/jpeg" }));
      await store.putMedia(`ph-b-${name}`, b.id, new Blob(["b"], { type: "image/jpeg" }));
      await store.setMeta("activeProfile", b.id);
      const names = (await store.listProfiles()).map((p) => p.name);
      expect(names).toEqual(expect.arrayContaining([a.name, b.name]));
      expect(await store.getMeta("activeProfile")).toBe(b.id);
      await store.deleteProfile(a.id);
      expect(await store.getMedia(`ph-a-${name}`)).toBeNull();
      expect(await store.getMedia(`ph-b-${name}`)).not.toBeNull();
      expect((await store.listProfiles()).some((p) => p.id === a.id)).toBe(false);
    }
  });
});

describe("backups", () => {
  it("round-trips a student, their words and photos into a new profile", async () => {
    const store = new MemoryStore();
    let p = newProfile("Sam");
    p = addWordAt(
      p,
      { boardId: "people", row: 3, col: 0, label: "Grandma Ada", kind: "noun", photoId: "ph-1" },
      builtInPlaces("people"),
    );
    p = saveMessage(p, "my name is Sam");
    await store.saveProfile(p);
    await store.putMedia(
      "ph-1",
      p.id,
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
    );

    const file = await makeBackup(store, p);
    const other = new MemoryStore();
    const restored = await restoreBackup(other, file);
    expect(restored.id).not.toBe(p.id);
    expect(restored.name).toBe("Sam");
    expect(restored.saved.map((m) => m.text)).toEqual(["my name is Sam"]);
    const word = restored.added[0]!;
    expect(word).toMatchObject({ label: "Grandma Ada", row: 3, col: 0 });
    expect(word.photoId).toBeDefined();
    expect(word.photoId).not.toBe("ph-1");
    const photo = await other.getMedia(word.photoId!);
    expect(new Uint8Array(await photo!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects files that aren't backups", async () => {
    const store = new MemoryStore();
    await expect(restoreBackup(store, new Blob(["not json"]))).rejects.toBeInstanceOf(BackupError);
    await expect(
      restoreBackup(store, new Blob([JSON.stringify({ format: "other" })])),
    ).rejects.toBeInstanceOf(BackupError);
    expect(await store.listProfiles()).toEqual([]);
  });

  it("drops photos of the wrong type", async () => {
    const store = new MemoryStore();
    const p = newProfile("Sam");
    const file = new Blob([
      JSON.stringify({
        format: "communicate-backup",
        version: 1,
        exportedAt: "",
        profile: p,
        photos: [{ id: "x", type: "text/html", data: btoa("<script>") }],
      }),
    ]);
    const restored = await restoreBackup(store, file);
    expect(restored.name).toBe("Sam");
  });
});
