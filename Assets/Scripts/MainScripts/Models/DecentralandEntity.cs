using UnityEngine;

[System.Serializable]
public class DecentralandEntity {
  public GameObject gameObjectReference;
  public string id;
  public string parentId;
  public EntityComponents components = new EntityComponents();

  Vector3 auxiliaryUnityVector3;

  public void UpdateGameObjectComponents() {
    if (gameObjectReference != null) {
      if (components.transform != null) {
        // Apply position update
        auxiliaryUnityVector3.Set(components.transform.position.x,
                                  components.transform.position.y,
                                  components.transform.position.z);

        gameObjectReference.transform.position = auxiliaryUnityVector3;

        // Apply rotation update
        auxiliaryUnityVector3.Set(components.transform.rotation.x,
                                  components.transform.rotation.y,
                                  components.transform.rotation.z);

        gameObjectReference.transform.rotation = Quaternion.Euler(auxiliaryUnityVector3);

        // Apply scale update
        auxiliaryUnityVector3.Set(components.transform.scale.x,
                                  components.transform.scale.y,
                                  components.transform.scale.z);

        gameObjectReference.transform.localScale = auxiliaryUnityVector3;
      }

      // TODO: Update the rest of the components.
    }
  }

  [System.Serializable]
  public class EntityComponents {
    public EntityShape shape = null;
    public EntityTransform transform = null;

    [System.Serializable]
    public class EntityShape {
      public string tag;
      public string src;
    }

    [System.Serializable]
    public class EntityTransform {
      public Vector3 position;
      public Vector3 rotation;
      public Vector3 scale;
    }
  }
}
