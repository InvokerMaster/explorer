using System;
using System.Collections;
using System.Collections.Generic;
using DCL.Controllers;
using DCL.Helpers;
using DCL.Models;
using UnityEngine;

namespace DCL.Components {
  public class BasicMaterial : BaseDisposable {

    [System.Serializable]
    public class Model
    {
      public string texture;

      [Range(1, 3)]
      public int samplingMode;  // 1: NEAREST; 2: BILINEAR; 3: TRILINEAR

      [Range(1, 3)]
      public int wrap;          // 1: CLAMP; 2: WRAP; 3: MIRROR

      [Range(0f, 1f)]
      public float alphaTest = 1f; // value that defines if a pixel is visible or invisible (no transparency gradients)
    }

    Model model = new Model();
    public override string componentName => "material";
    public Material material;

    public BasicMaterial(ParcelScene scene) : base(scene) {
      material = UnityEngine.Object.Instantiate(Resources.Load<Material>("Materials/BasicShapeMaterial"));

      OnAttach += OnMaterialAttached;
      OnDetach += OnMaterialDetached;
    }
    
    public override IEnumerator ApplyChanges(string newJson) {
      JsonUtility.FromJsonOverwrite(newJson, model);

      if (!string.IsNullOrEmpty(model.texture)) {
        yield return LandHelpers.FetchTexture(scene, model.texture, (fetchedTexture) => {
          material.mainTexture = fetchedTexture;

          // WRAP MODE CONFIGURATION
          switch (model.wrap) {
            case 2:
              material.mainTexture.wrapMode = TextureWrapMode.Repeat;
              break;
            case 3:
              material.mainTexture.wrapMode = TextureWrapMode.Mirror;
              break;
            default:
              material.mainTexture.wrapMode = TextureWrapMode.Clamp;
              break;
          }

          // SAMPLING/FILTER MODE CONFIGURATION
          switch (model.samplingMode) {
            case 2:
              material.mainTexture.filterMode = FilterMode.Bilinear;
              break;
            case 3:
              material.mainTexture.filterMode = FilterMode.Trilinear;
              break;
            default:
              material.mainTexture.filterMode = FilterMode.Point;
              break;
          }

          // ALPHA CONFIGURATION
          material.SetFloat("_AlphaClip", model.alphaTest);
        });
      }
    }

    void OnMaterialAttached(DecentralandEntity entity) {
      var meshRenderer = LandHelpers.GetOrCreateComponent<MeshRenderer>(entity.gameObject);
      meshRenderer.sharedMaterial = material;
    }

    void OnMaterialDetached(DecentralandEntity entity) {
      var meshRenderer = entity.gameObject.GetComponent<MeshRenderer>();
      if (meshRenderer && meshRenderer.sharedMaterial == material) {
        meshRenderer.sharedMaterial = null;
      }
    }
  }
}
