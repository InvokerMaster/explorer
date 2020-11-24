using DCL;
using DCL.Models;
using DCL.Components;
using DCL.Controllers;
using DCL.Helpers;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using DCL.Configuration;

public class DCLBuilderInWorldEntity : EditableEntity
{
    public string entityUniqueId;
    public string descriptiveName;

    public System.Action<DCLBuilderInWorldEntity> onStatusUpdate, OnDelete;

    private bool isLockedValue = false;
    public bool IsLocked
    {
        get
        {
            return isLockedValue;
        }
        set
        {
            isLockedValue = value;
            onStatusUpdate?.Invoke(this);
        }
    }

    private bool isSelectedValue = false;
    public bool IsSelected
    {
        get
        {
            return isSelectedValue;
        }
        set
        {
            isSelectedValue = value;
            onStatusUpdate?.Invoke(this);
        }
    }

    private bool isNewValue = false;
    public bool IsNew
    {
        get
        {
            return isNewValue;
        }
        set
        {
            isNewValue = value;
            onStatusUpdate?.Invoke(this);
        }
    }

    private bool isVisibleValue = true;
    public bool IsVisible
    {
        get
        {
            return isVisibleValue;
        }
        set
        {
            isVisibleValue = value;
            onStatusUpdate?.Invoke(this);
        }
    }

    public bool isVoxel { get; set; } = false;

    Transform originalParent;

    Material[] originalMaterials;

    Material editMaterial;

    Dictionary<string, GameObject> collidersDictionary = new Dictionary<string, GameObject>();

    public void Init(DecentralandEntity entity, Material editMaterial)
    {
        rootEntity = entity;
        rootEntity.OnShapeUpdated += OnShapeUpdate;

        this.editMaterial = editMaterial;
        isVoxel = false;


        entityUniqueId = rootEntity.scene.sceneData.id + rootEntity.entityId;
        IsVisible = rootEntity.gameObject.activeSelf;

        SearchForName();

        if (rootEntity.meshRootGameObject && rootEntity.meshesInfo.renderers.Length > 0)
        {
            CreateCollidersForEntity(rootEntity);
            if (IsEntityAFloor()) IsLocked = true;
            if (IsEntityAVoxel()) SetEntityAsVoxel();
        }
    }

    public void Select()
    {
        IsSelected = true;
        originalParent = rootEntity.gameObject.transform.parent;
        SaveOriginalMaterialAndSetEditMaterials();
        SceneController.i.boundariesChecker.AddPersistent(rootEntity);
    }

    public void Deselect()
    {
        if (!IsSelected) return;

        IsSelected = false;
        if (rootEntity.gameObject != null)
            rootEntity.gameObject.transform.SetParent(originalParent);
        SceneController.i.boundariesChecker.RemoveEntityToBeChecked(rootEntity);
        SetOriginalMaterials();

    }

    public void ToggleShowStatus()
    {
        rootEntity.gameObject.SetActive(!gameObject.activeSelf);
        IsVisible = gameObject.activeSelf;
        onStatusUpdate?.Invoke(this);
    }

    public void ToggleLockStatus()
    {
        IsLocked = !IsLocked;
    }

    public void Delete()
    {
        Deselect();
        DestroyColliders();
        OnDelete?.Invoke(this);
    }

    public void CreateColliders()
    {
        if (rootEntity.meshRootGameObject && rootEntity.meshesInfo.renderers.Length > 0)
        {
            CreateCollidersForEntity(rootEntity);
        }
    }

    public void DestroyColliders()
    {
        foreach (GameObject entityCollider in collidersDictionary.Values)
        {
            GameObject.Destroy(entityCollider);
        }
        collidersDictionary.Clear();
    }

    void SearchForName()
    {
        //foreach (KeyValuePair<CLASS_ID_COMPONENT, BaseComponent> keyValuePair in rootEntity.components)
        //{
        //    if (keyValuePair.Key == CLASS_ID.NAME)
        //    {

        //    }
        //}
    }

    void SetOriginalMaterials()
    {
        if (rootEntity.meshesInfo.renderers == null) return;

        int cont = 0;
        foreach (Renderer renderer in rootEntity.meshesInfo.renderers)
        {
            renderer.material = originalMaterials[cont];
            cont++;
        }

    }

    void SetEntityAsVoxel()
    {
        isVoxel = true;
        gameObject.tag = BuilderInWorldSettings.VOXEL_TAG;
    }
    void SaveOriginalMaterialAndSetEditMaterials()
    {
        if (rootEntity.meshesInfo.renderers != null && rootEntity.meshesInfo.renderers.Length >= 1)
        {
            originalMaterials = new Material[rootEntity.meshesInfo.renderers.Length];
            int cont = 0;
            foreach (Renderer renderer in rootEntity.meshesInfo.renderers)
            {
                if(renderer.material != editMaterial)originalMaterials[cont] = renderer.material;
                renderer.material = editMaterial;
                cont++;
            }
        }
    }

    void OnShapeUpdate(DecentralandEntity decentralandEntity)
    {
        if (IsSelected)
            SaveOriginalMaterialAndSetEditMaterials();

        CreateCollidersForEntity(decentralandEntity);
        if (IsEntityAFloor()) IsLocked = true;
        if (IsEntityAVoxel()) SetEntityAsVoxel();
    }

    void CreateCollidersForEntity(DecentralandEntity entity)
    {
        DecentralandEntity.MeshesInfo meshInfo = entity.meshesInfo;
        if (meshInfo == null ||
            meshInfo.currentShape == null ||
            !meshInfo.currentShape.IsVisible())
            return;

        if (collidersDictionary.ContainsKey(entity.scene.sceneData.id + entity.entityId)) return;

        if (entity.children.Count > 0)
        {
            using (var iterator = entity.children.GetEnumerator())
            {
                while (iterator.MoveNext())
                {
                    CreateCollidersForEntity(iterator.Current.Value);
                }
            }
        }


        GameObject entityCollider = new GameObject(entity.entityId);
        entityCollider.layer = LayerMask.NameToLayer("OnBuilderPointerClick");


        for (int i = 0; i < meshInfo.renderers.Length; i++)
        {
            Transform t = entityCollider.transform;
            t.SetParent(meshInfo.renderers[i].transform);
            t.ResetLocalTRS();

            var meshCollider = entityCollider.AddComponent<MeshCollider>();

            if (meshInfo.renderers[i] is SkinnedMeshRenderer)
            {
                Mesh meshColliderForSkinnedMesh = new Mesh();
                (meshInfo.renderers[i] as SkinnedMeshRenderer).BakeMesh(meshColliderForSkinnedMesh);
                meshCollider.sharedMesh = meshColliderForSkinnedMesh;
                t.localScale = new Vector3(1 / entity.gameObject.transform.lossyScale.x, 1 / entity.gameObject.transform.lossyScale.y, 1 / entity.gameObject.transform.lossyScale.z);
            }
            else
            {
                meshCollider.sharedMesh = meshInfo.renderers[i].GetComponent<MeshFilter>().sharedMesh;
            }
            meshCollider.enabled = meshInfo.renderers[i].enabled;

        }

        collidersDictionary.Add(entity.scene.sceneData.id + entity.entityId, entityCollider);

    }

    bool IsEntityAFloor()
    {
        if (rootEntity.meshesInfo?.currentShape == null)
            return false;
        if (rootEntity.meshesInfo.renderers?.Length <= 0)
            return false;
        if (rootEntity.meshesInfo.mergedBounds.size.y >= 0.05f)
            return false;
        if (rootEntity.gameObject.transform.position.y >= 0.05f)
            return false;

        return true;
    }

    bool IsEntityAVoxel()
    {
        if (rootEntity.meshesInfo?.currentShape == null) return false;
        if (rootEntity.meshesInfo.renderers?.Length <= 0) return false;
        if (rootEntity.meshesInfo.mergedBounds.size != Vector3.one) return false;
        return true;
    }
}