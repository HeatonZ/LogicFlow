import { cloneDeep } from 'lodash-es'
import { computed, observable } from 'mobx'
import BaseNodeModel from './BaseNodeModel'
import { ModelType } from '../../constant'

export class CircleNodeModel extends BaseNodeModel {
  modelType = ModelType.CIRCLE_NODE
  @observable r = 50

  @computed get width(): number {
    return this.r * 2
  }
  @computed get height(): number {
    return this.r * 2
  }
  getNodeStyle() {
    const style = super.getNodeStyle()
    const {
      graphModel: {
        theme: { circle },
      },
    } = this
    return {
      ...style,
      ...cloneDeep(circle),
    }
  }
  getDefaultAnchor() {
    const { x, y, r } = this
    return [
      { x, y: y - r, id: `${this.id}_0` },
      { x: x + r, y, id: `${this.id}_1` },
      { x, y: y + r, id: `${this.id}_2` },
      { x: x - r, y, id: `${this.id}_3` },
    ]
  }
}

export default CircleNodeModel
