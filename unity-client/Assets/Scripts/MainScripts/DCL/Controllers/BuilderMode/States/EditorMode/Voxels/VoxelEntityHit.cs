using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class VoxelEntityHit 
{
    public DecentralandEntityToEdit entityHitted;
    public Vector3Int hitVector;

    public VoxelEntityHit(DecentralandEntityToEdit entity, RaycastHit hit)
    {
        entityHitted = entity;
        CalculateHitVector(hit);
    }

    void CalculateHitVector(RaycastHit hit)
    {
        Vector3 center = entityHitted.rootEntity.meshesInfo.mergedBounds.center;
        Vector3 min = entityHitted.rootEntity.meshesInfo.mergedBounds.min;
        Vector3 max = entityHitted.rootEntity.meshesInfo.mergedBounds.max;

        if (Mathf.Abs(min.x -hit.point.x) < 0.001f)
        {
            hitVector = Vector3Int.left;        
        }
        else if (Mathf.Abs(max.x - hit.point.x) < 0.001f)
        {
            hitVector = Vector3Int.right;
        }
        else if (Mathf.Abs(min.y - hit.point.y) < 0.001f)
        {
            hitVector = Vector3Int.down;       
        }
        else if (Mathf.Abs(max.y - hit.point.y) < 0.001f)
        {
            hitVector = Vector3Int.up;
        }
        else if (Mathf.Abs(min.z - hit.point.z) < 0.001f)
        {
            hitVector = new Vector3Int(0, 0, -1);
        }
        else if (Mathf.Abs(max.z - hit.point.z) < 0.001f)
        {
            hitVector = new Vector3Int(0, 0, 1);
        }

    }
}