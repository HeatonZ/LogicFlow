import {
  map,
  isArray,
  slice,
  isNil,
  assign,
  flattenDeep,
  find,
  isEmpty,
} from 'lodash-es'
import { createElement as h, render } from 'preact/compat'
import { ElementType, ModelType, EventType } from '@logicflow/core'
import LabelContainer from './LabelOverlay'
import LabelModel from './LabelModel'
import LabelOverlayModel from './LabelOverlayModel'
import {
  getNodeBBoxInfo,
  getLabelDeltaOfBbox,
  getNodeLabelPosition,
  isPointInBezier,
  isPointInPolyline,
  defaultPosition,
  getClosestPointOnBezier,
  getTextPositionOfPolyline,
  pointPositionAfterRotate,
  pointPositionRatio,
} from './util'

export class Label {
  static pluginName = 'label'
  lf: any
  container: any
  labelContainer: any
  options: any
  model: LabelOverlayModel

  constructor({ lf, options }) {
    this.lf = lf
    this.labelContainer = new LabelContainer()
    this.lf.updateEditConfig({
      nodeTextMode: 'label',
      edgeTextModel: 'label',
    })
    this.options = options
    this.addListeners()
    this.model = new LabelOverlayModel(lf)
  }

  addListeners() {
    const {
      LABEL_DROP,
      LABEL_SHOULD_ADD,
      LABEL_BATCH_ADD,
      LABEL_SHOULD_DELETE,
      LABEL_BATCH_DELETE,
      LABEL_SHOULD_UPDATE,
      EDGE_DELETE,
      NODE_DELETE,
    } = EventType
    // 新增
    this.lf.on(LABEL_SHOULD_ADD, (data) => {
      this.model.addLabel(data)
    })
    this.lf.on(LABEL_BATCH_ADD, ({ data, model }) => {
      let labelList = data
      if (!data) {
        const curLabels = this.model.labels.filter(
          (item) => item.relateId === model.relateId,
        )
        labelList = curLabels.map((labelITem) => {
          const { x, y } = labelITem
          // 多个文本的情况下，每个文本的移动距离 = 当前位置 + 当前文本位置与节点中心位置的差 + 固定偏移量
          // TODO：这个 30 是否可以用某个全局控制偏移量的常量
          return {
            ...labelITem,
            x: x + (x - model.x) + 30,
            y: y + (y - model.y) + 30,
          }
        })
      }
      this.model.addLabels(labelList)
    })
    // 删除
    this.lf.on(LABEL_SHOULD_DELETE, ({ data }) => {
      this.model.deleteLabel(data)
    })
    this.lf.on(LABEL_BATCH_DELETE, ({ data, model }) => {
      let labelList = data
      if (!data) {
        labelList = this.model.labels.filter(
          (item) => item.relateId === model.relateId,
        )
      }
      this.model.deleteLabels(labelList)
    })
    this.lf.on([EDGE_DELETE, NODE_DELETE].join(','), ({ data }) => {
      const labelList = this.model.labels.filter(
        (item) => item.relateId === data.id,
      )
      this.model.deleteLabels(labelList)
    })
    // 更新
    this.lf.on(LABEL_SHOULD_UPDATE, ({ data, model }) => {
      let targetLabels: LabelModel[] = []
      if (data && isArray(data)) {
        // 如果传的是需要更新的数据，就直接更新
        data.forEach((item) => {
          const targetLabel = find(
            this.model.labels,
            (label) => label.id === item.id,
          )
          targetLabel?.setAttributes(item)
        })
        return
      }
      const {
        BaseType,
        modelType,
        relateId,
        deltaX,
        deltaY,
        points,
        pointsList,
        width,
        height,
        x,
        y,
        rotate,
        nodeRotate,
        nodeResize,
      } = model
      if (BaseType === ElementType.NODE && relateId) {
        // 内部触发节点变换时文本更新
        targetLabels = this.model.labels.filter(
          (label) => label.relateId === model.relateId,
        )
        if (isEmpty(targetLabels)) return
        // 节点移动的情况
        if (!isNil(deltaX) && !isNil(deltaY)) {
          targetLabels.forEach((item) => {
            item.setAttributes({
              x: item.x + deltaX,
              y: item.y + deltaY,
            })
          })
          return
        }
        // 节点旋转的情况
        if (nodeRotate) {
          targetLabels.forEach((item) => {
            const { x: itemX, y: itemY } = item
            const newPosition = pointPositionAfterRotate(
              { x: itemX, y: itemY },
              rotate,
              { x, y },
            )
            item.setAttributes({
              x: item.x + (newPosition.x - itemX),
              y: item.y + (newPosition.y - itemY),
            })
          })
          return
        }
        // 节点缩放的情况
        if (nodeResize) {
          targetLabels.forEach((item) => {
            const newPosition = getNodeLabelPosition(
              item,
              getNodeBBoxInfo({ x, y }, width, height),
            )
            item.setAttributes(newPosition)
          })
          return
        }
        // 其他情况
        if (data) {
          targetLabels.forEach((item) => {
            item.setAttributes(data)
          })
        }
      }
      if (BaseType === ElementType.EDGE && relateId) {
        if (!isNil(deltaX) && !isNil(deltaY)) {
          targetLabels.forEach((item) => {
            item.setAttributes({
              x: item.x + model.deltaX,
              y: item.y + model.deltaY,
            })
          })
          return
        }
        if ((modelType === ModelType.BEZIER_EDGE && pointsList) || points) {
          // 内部的定制逻辑
          targetLabels = this.model.labels.filter(
            (label) => label.relateId === model.relateId,
          )
          if (isEmpty(targetLabels)) return
          targetLabels.forEach((item) => {
            const { x: labelX, y: labelY } = item
            const newPoint =
              modelType === ModelType.BEZIER_EDGE
                ? getClosestPointOnBezier(item, pointsList)
                : getTextPositionOfPolyline(item, points)
            item.setAttributes({
              x: item.x + (newPoint.x - labelX),
              y: item.y + (newPoint.y - labelY),
            })
          })
        }
        if (data) {
          targetLabels.forEach((item) => {
            item.setAttributes(data)
          })
        }
      }
    })
    this.lf.on(LABEL_DROP, ({ data }) => {
      const targetLabel = this.model.labels.find((item) => item.id === data.id)
      if (!targetLabel) return
      const { type, relateId, x, y } = targetLabel
      if (type === ElementType.NODE) {
        const nodeModel = this.lf.graphModel.getNodeModelById(relateId)
        const { x: nodeX, y: nodeY, width, height, BaseType } = nodeModel
        targetLabel.setAttributes(
          getLabelDeltaOfBbox(
            { x, y },
            getNodeBBoxInfo({ x: nodeX, y: nodeY }, width, height),
            BaseType,
          ),
        )
      } else {
        const edgeModel = this.lf.graphModel.getEdgeModelById(relateId)
        const { pointsList, modelType, BaseType } = edgeModel
        targetLabel.setAttributes({
          ...getLabelDeltaOfBbox({ x, y }, pointsList, BaseType),
          isInLine:
            modelType === ModelType.BEZIER_EDGE
              ? isPointInBezier({ x, y }, pointsList)
              : isPointInPolyline({ x, y }, pointsList),
          ratio: pointPositionRatio({ x, y }, pointsList),
        })
      }
    })
  }

  formatLabel(data): LabelModel[] {
    const {
      graphModel: {
        editConfigModel: { edgeTextEdit, nodeTextEdit },
      },
    } = this.lf
    const { nodeTextVertical, edgeLabelVerticle } = this.options
    const {
      properties: { _labelOption, _label },
      BaseType,
      modelType,
      id,
      x,
      y,
      width,
      height,
      pointsList,
    } = data
    if (!_label || !isArray(_label)) {
      data.properties._label = []
      return []
    }
    // multiple时，判断是否有max，有的话超出max的数据就不存入，没有max就不限制
    // 非multiple时只取第一个作为对象给data.label
    const labelList = _label.map((item, index) => {
      const defaultPosit = defaultPosition(index, data)
      const editable =
        BaseType === ElementType.NODE ? nodeTextEdit : edgeTextEdit
      const vertical =
        BaseType === ElementType.NODE ? nodeTextVertical : edgeLabelVerticle
      const defaultText = {
        id: `${BaseType}_${id}_label_${index}`,
        type: BaseType,
        relateId: data.id,
        vertical: _labelOption.isVertical || vertical,
        draggable: false,
        editable: editable,
        isFocus: false,
        ...defaultPosit,
        ...getLabelDeltaOfBbox(
          defaultPosit,
          getNodeBBoxInfo({ x, y }, width, height),
          BaseType,
        ),
      }
      if (BaseType === ElementType.EDGE) {
        assign(defaultText, {
          ...getLabelDeltaOfBbox(defaultPosit, pointsList, BaseType),
          isInLine:
            modelType === ModelType.BEZIER_EDGE
              ? isPointInBezier(defaultPosit, pointsList)
              : isPointInPolyline(defaultPosit, pointsList),
          ratio: pointPositionRatio(defaultPosit, pointsList),
        })
      }
      if (typeof item === 'string') {
        return {
          ...defaultText,
          value: item,
          content: item,
        }
      }
      return {
        ...defaultText,
        ...item,
        content: item.content || item.value,
        ...getLabelDeltaOfBbox(
          item,
          getNodeBBoxInfo({ x, y }, width, height),
          BaseType,
        ),
      }
    })
    if (
      !isNil(_labelOption.maxCount) &&
      _labelOption.maxCount < labelList.length
    ) {
      console.warn('传入文案数量超出所设置最大值')
    }
    return _labelOption.isMultiple
      ? slice(
          labelList,
          0,
          isNil(_labelOption.maxCount) ||
            _labelOption.maxCount > labelList.length
            ? labelList.length
            : _labelOption.maxCount,
        )
      : [labelList[0]]
  }

  render(lf, toolOverlay) {
    // label需要存储关联节点/边的信息，所以labelModel初始化时机需要在节点/边Model初始化后
    this.model.labels = flattenDeep(
      map(lf.graphModel.sortElements, (element) => {
        const labelConfigs = this.formatLabel(element)
        return map(labelConfigs, (item) => new LabelModel(item))
      }),
    )
    const vDom = h(LabelContainer, {
      graphModel: lf.graphModel,
      richTextEditor: lf.extension.richTextEditor.editor,
      useRichText: lf.useRichText,
      options: this.options,
      labels: this.model.labels,
    })
    render(vDom, toolOverlay)
  }
}

export default Label
