<?php

// 最小化中文验证消息：仅覆盖本项目用到的规则键，未覆盖的键回退英文
return [
    'required' => ':attribute 不能为空',
    'string' => ':attribute 必须为字符串',
    'integer' => ':attribute 必须为整数',
    'min' => [
        'numeric' => ':attribute 不能小于 :min',
    ],
    'max' => [
        'numeric' => ':attribute 不能大于 :max',
    ],
    'attributes' => [
        'keyword' => '关键词 keyword',
        'plugName' => '音源 plugName',
        'pageIndex' => '页码 pageIndex',
        'pageSize' => '每页条数 pageSize',
    ],
];
